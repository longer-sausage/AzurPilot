import { useLayoutEffect, useRef } from 'react'

export function AutoTextarea({id, value, disabled, onChange}: {
  id: string; value: string; disabled?: boolean; onChange: (value: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const input = ref.current!
    const resize = () => {
      // 先收起再测量，删除内容时也能缩回一行；scrollHeight 包含自动换行。
      input.style.height = '0px'
      const style = getComputedStyle(input)
      input.style.height = `${input.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`
    }
    resize()
    let width = input.clientWidth
    let frame = 0
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== width) {
        width = input.clientWidth
        cancelAnimationFrame(frame)
        // 延迟到下一帧写入高度，避免在观察回调中触发浏览器的尺寸反馈循环。
        frame = requestAnimationFrame(resize)
      }
    })
    observer.observe(input)
    return () => {observer.disconnect(); cancelAnimationFrame(frame)}
  }, [value])
  return <textarea ref={ref} id={id} value={value} rows={1} disabled={disabled} spellCheck={false} onChange={event => onChange(event.target.value)}/>
}
