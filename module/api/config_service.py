"""参数定义驱动的配置服务，负责路径约束、校验及乐观并发控制。"""
import copy
import hashlib
import json
import math
import re
import threading
from datetime import datetime
from pathlib import Path

from deploy.atomic import atomic_write
from module.api.protocol import ApiError
from module.config.transaction import config_transaction

ROOT = Path(__file__).resolve().parents[2]
NAME = re.compile(r'[A-Za-z][A-Za-z0-9_-]{0,63}\Z')
RESERVED = {'template', 'deploy', 'backup', 'con', 'prn', 'aux', 'nul',
            *(f'com{i}' for i in range(1, 10)), *(f'lpt{i}' for i in range(1, 10))}


class ConfigService:
    """只访问白名单配置，读操作不会触发运行器的配置写回。"""

    def __init__(self, root: Path = ROOT):
        self.root = root
        self.directory = root / 'config'
        self.lock = threading.RLock()
        argument = root / 'module/config/argument'
        self.args = self.read_json(argument / 'args.json')
        self.menu = self.read_json(argument / 'menu.json')
        self.translations = self.read_json(root / 'module/config/i18n/zh-CN.json')
        self.template = self.read_json(self.directory / 'template.json')

    @staticmethod
    def read_json(path):
        return json.loads(path.read_text(encoding='utf-8'))

    def translate(self, key):
        value = self.translations
        for part in key.split('.'):
            value = value.get(part, {}) if isinstance(value, dict) else {}
        return value if isinstance(value, str) and value != key else key.split('.')[-1]

    def path(self, name, exists=True):
        if not isinstance(name, str) or not NAME.fullmatch(name) or name.lower() in RESERVED:
            raise ApiError('INVALID_PARAMS', '实例名须以英文字母开头，仅包含字母、数字、短横线或下划线')
        path = self.directory / f'{name}.json'
        if path.is_symlink() or path.resolve().parent != self.directory.resolve():
            raise ApiError('INVALID_PARAMS', '配置路径无效')
        if exists and not path.is_file():
            raise ApiError('NOT_FOUND', '实例不存在')
        return path

    def names(self):
        return sorted(p.stem for p in self.directory.glob('*.json')
                      if NAME.fullmatch(p.stem) and p.stem.lower() not in RESERVED
                      and not p.is_symlink() and self.is_instance(p))

    def is_instance(self, path):
        try:
            return isinstance(self.read_json(path).get('Alas'), dict)
        except (OSError, ValueError, AttributeError):
            return False

    def read(self, name):
        path = self.path(name)
        try:
            raw = path.read_bytes()
            data = json.loads(raw)
            if not isinstance(data, dict) or not isinstance(data.get('Alas'), dict):
                raise ValueError()
        except (OSError, ValueError) as exc:
            raise ApiError('CONFIG_INVALID', '配置文件损坏，请从备份恢复') from exc
        # 旧配置缺失的参数在读时补齐，完整迁移仍由核心运行器负责。
        merged = copy.deepcopy(self.template)
        for task, groups in data.items():
            if isinstance(groups, dict):
                for group, fields in groups.items():
                    if isinstance(fields, dict):
                        merged.setdefault(task, {}).setdefault(group, {}).update(fields)
        return merged, hashlib.sha256(raw).hexdigest()

    def schema(self):
        return {'menu': self.menu, 'args': self.args, 'translations': self.translations}

    def get(self, name):
        data, revision = self.read(name)
        return {'instance': name, 'revision': revision, 'values': data}

    def create(self, name, source=None):
        with self.lock:
            path = self.path(name, exists=False)
            data = self.read(source)[0] if source else copy.deepcopy(self.template)
            # 排他创建避免不同会话覆盖已有配置。
            try:
                with path.open('x', encoding='utf-8') as file:
                    json.dump(data, file, ensure_ascii=False, indent=2)
            except FileExistsError as exc:
                raise ApiError('ALREADY_EXISTS', '同名实例已存在') from exc
            return self.get(name)

    def validate(self, path, value):
        parts = path.split('.')
        if len(parts) != 3:
            raise ApiError('INVALID_PARAMS', '配置路径必须为 Task.Group.Argument')
        field = self.args
        for part in parts:
            field = field.get(part, {})
        if not field or field.get('display') in ('hide', 'disabled', 'readonly', 'display') or field.get('type') in ('storage', 'stored', 'state', 'lock'):
            raise ApiError('READ_ONLY', f'参数不存在或不允许修改：{path}')
        default, kind = field.get('value'), field.get('type')
        options = field.get('option')
        if kind == 'multiselect':
            if not isinstance(value, list) or len(value) > len(options or []) or any(
                not any(type(selected) is type(item) and selected == item for item in options or [])
                for selected in value
            ) or len(set(map(str, value))) != len(value):
                raise ApiError('INVALID_PARAMS', f'多选参数包含无效或重复选项：{path}')
            return parts
        if options and not any(type(value) is type(item) and value == item for item in options):
            raise ApiError('INVALID_PARAMS', f'请选择有效选项：{path}')
        if kind == 'checkbox' or isinstance(default, bool):
            valid = isinstance(value, bool)
        elif isinstance(default, int):
            valid = type(value) is int
        elif isinstance(default, float):
            valid = type(value) in (float, int)
        else:
            valid = isinstance(value, str) or (default is None and value is None)
        if not valid or (isinstance(value, str) and len(value) > 20000) or (type(value) is float and not math.isfinite(value)):
            raise ApiError('INVALID_PARAMS', f'参数类型或长度不正确：{path}')
        rule = field.get('validate')
        if rule == 'datetime':
            try:
                datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
            except ValueError as exc:
                raise ApiError('INVALID_PARAMS', f'日期格式应为 YYYY-MM-DD HH:mm:ss：{path}') from exc
        elif isinstance(rule, list) and len(rule) == 2:
            if type(value) not in (int, float) or not rule[0] <= value <= rule[1]:
                raise ApiError('INVALID_PARAMS', f'参数必须在 {rule[0]} 到 {rule[1]} 之间：{path}')
        elif isinstance(rule, str) and isinstance(value, (str, int, float)):
            if not re.fullmatch(rule, str(value)):
                raise ApiError('INVALID_PARAMS', f'参数格式不正确：{path}')
        return parts

    def patch(self, name, revision, changes):
        with self.lock, config_transaction(self.path(name)):
            data, current = self.read(name)
            if revision != current:
                raise ApiError('CONFLICT', '配置已被其他页面或运行任务修改，请重新加载后保存')
            seen = set()
            for change in changes:
                task, group, arg = self.validate(change.path, change.value)
                if change.path in seen:
                    raise ApiError('INVALID_PARAMS', '同一次保存不能重复修改同一个参数')
                seen.add(change.path)
                data.setdefault(task, {}).setdefault(group, {})[arg] = change.value
            # 保存前再次核对运行器写回，避免耗时校验期间覆盖新版本。
            if self.read(name)[1] != current:
                raise ApiError('CONFLICT', '运行任务刚刚更新了配置，请重新加载')
            atomic_write(str(self.path(name)), json.dumps(data, ensure_ascii=False, indent=2))
            return self.get(name)

    def delete(self, name, revision):
        with self.lock, config_transaction(self.path(name)):
            if self.read(name)[1] != revision:
                raise ApiError('CONFLICT', '配置已变化，请重新加载后删除')
            # 删除操作保留备份，用户可从 config/backup 手动恢复。
            backup = self.directory / 'backup'
            backup.mkdir(exist_ok=True)
            target = backup / f'{name}-{datetime.now():%Y%m%d-%H%M%S-%f}.json'
            self.path(name).replace(target)
            return {'deleted': name}
