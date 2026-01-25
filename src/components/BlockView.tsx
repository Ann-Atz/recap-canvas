import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import type { Block } from '../models/canvas'

type BlockViewProps = {
  block: Block
  selected?: boolean
  highlight?: boolean
  dimmed?: boolean
  zoom: number
  onPositionChange: (id: string, x: number, y: number) => void
  onUpdate: (id: string, updater: (block: Block) => Block) => void
  onSelect: (id: string, mode: 'single' | 'toggle') => void
  onDelete: (id: string) => void
}

const DRAG_THRESHOLD = 6

export function BlockView({
  block,
  selected = false,
  highlight = false,
  dimmed = false,
  zoom,
  onPositionChange,
  onUpdate,
  onSelect,
  onDelete,
}: BlockViewProps) {
  const pointerIdRef = useRef<number | null>(null)
  const resizePointerIdRef = useRef<number | null>(null)
  const startPointerRef = useRef<{ x: number; y: number } | null>(null)
  const startResizeRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const startPositionRef = useRef<{ x: number; y: number } | null>(null)
  const startAnchorRef = useRef<HTMLAnchorElement | null>(null)
  const metaRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const dragEnabledRef = useRef<boolean>(false)
  const hasDraggedRef = useRef(false)
  const previousUserSelectRef = useRef<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isEditingText, setIsEditingText] = useState(false)
  const [isEditingLink, setIsEditingLink] = useState(false)
  const [isEditingImage, setIsEditingImage] = useState(false)
  const [imageError, setImageError] = useState(false)
  const linkDraft = useRef<{ label: string; url: string }>({ label: block.type === 'link' ? block.label : '', url: block.type === 'link' ? block.url : '' })
  const imageDraft = useRef<{ src: string }>({
    src: block.type === 'image' ? block.src : '',
  })

  const disableSelection = () => {
    if (previousUserSelectRef.current === null) {
      previousUserSelectRef.current = document.body.style.userSelect
      document.body.style.userSelect = 'none'
    }
  }

  const restoreSelection = () => {
    if (previousUserSelectRef.current !== null) {
      document.body.style.userSelect = previousUserSelectRef.current
      previousUserSelectRef.current = null
    }
  }

  const getImageHeight = (imageBlock: Extract<Block, { type: 'image' }>) => {
    const ratio =
      imageBlock.aspectRatio ??
      (typeof imageBlock.height === 'number' && imageBlock.height > 0 ? imageBlock.height / imageBlock.width : 0.75)
    return imageBlock.width * ratio
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType !== 'touch') {
      startAnchorRef.current = null
      return
    }

    const targetEl = event.target as HTMLElement
    startAnchorRef.current = targetEl.closest('a')
    dragEnabledRef.current = Boolean(targetEl.closest('.block-drag-handle'))

    pointerIdRef.current = event.pointerId
    startPointerRef.current = { x: event.clientX, y: event.clientY }
    startPositionRef.current = { x: block.x, y: block.y }
    hasDraggedRef.current = false
    setIsDragging(dragEnabledRef.current)
    if (dragEnabledRef.current) {
      disableSelection()
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current === null || pointerIdRef.current !== event.pointerId) return
    if (!dragEnabledRef.current) return
    if (!startPointerRef.current || !startPositionRef.current) return

    const dx = (event.clientX - startPointerRef.current.x) / zoom
    const dy = (event.clientY - startPointerRef.current.y) / zoom

    if (!hasDraggedRef.current) {
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance < DRAG_THRESHOLD) return
      hasDraggedRef.current = true
    }

    onPositionChange(block.id, startPositionRef.current.x + dx, startPositionRef.current.y + dy)
  }

  const handleResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.button !== 0 && event.pointerType !== 'touch') return
    resizePointerIdRef.current = event.pointerId
    const baseHeight =
      block.type === 'image'
        ? getImageHeight(block)
        : block.height ??
          (block.type === 'text' && textareaRef.current ? textareaRef.current.scrollHeight + 34 : 120)
    startResizeRef.current = { x: event.clientX, y: event.clientY, width: block.width, height: baseHeight }
    setIsResizing(true)
    disableSelection()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (resizePointerIdRef.current === null || resizePointerIdRef.current !== event.pointerId) return
    if (!startResizeRef.current) return
    const dx = (event.clientX - startResizeRef.current.x) / zoom
    const dy = (event.clientY - startResizeRef.current.y) / zoom
    const newWidth = Math.max(180, startResizeRef.current.width + dx)
    const newHeight =
      block.type === 'image'
        ? newWidth *
          (block.aspectRatio ??
            (startResizeRef.current.height > 0 ? startResizeRef.current.height / startResizeRef.current.width : 0.75))
        : Math.max(120, startResizeRef.current.height + dy)
    onUpdate(block.id, (current) => {
      if (current.type === 'image') {
        const ratio =
          current.aspectRatio ??
          (startResizeRef.current
            ? startResizeRef.current.height / startResizeRef.current.width
            : newHeight / Math.max(newWidth, 1))
        return { ...current, width: newWidth, height: undefined, aspectRatio: ratio }
      }
      return { ...current, width: newWidth, height: newHeight }
    })
  }

  const handleResizePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (resizePointerIdRef.current === null || resizePointerIdRef.current !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(resizePointerIdRef.current)) {
      event.currentTarget.releasePointerCapture(resizePointerIdRef.current)
    }
    resizePointerIdRef.current = null
    startResizeRef.current = null
    setIsResizing(false)
    restoreSelection()
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (
      dragEnabledRef.current &&
      pointerIdRef.current !== null &&
      event.currentTarget.hasPointerCapture(pointerIdRef.current)
    ) {
      event.currentTarget.releasePointerCapture(pointerIdRef.current)
    }
    if (startAnchorRef.current && !hasDraggedRef.current) {
      startAnchorRef.current.click()
    }
    pointerIdRef.current = null
    startPointerRef.current = null
    startPositionRef.current = null
    startAnchorRef.current = null
    dragEnabledRef.current = false
    setIsDragging(false)
    restoreSelection()
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current === null) return
    const isClick = !hasDraggedRef.current
    const targetEl = event.target as HTMLElement
    const isFormControl = ['INPUT', 'TEXTAREA', 'BUTTON'].includes(targetEl.tagName)
    if (isClick && !isFormControl) {
      onSelect(block.id, event.shiftKey ? 'toggle' : 'single')
    }
    endDrag(event)
  }

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current === null) return
    endDrag(event)
    if (resizePointerIdRef.current !== null && event.currentTarget.hasPointerCapture(resizePointerIdRef.current)) {
      event.currentTarget.releasePointerCapture(resizePointerIdRef.current)
    }
    resizePointerIdRef.current = null
    startResizeRef.current = null
    setIsResizing(false)
    restoreSelection()
  }

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (hasDraggedRef.current) {
      event.preventDefault()
    }
  }

  const adjustTextareaSize = () => {
    if (block.type !== 'text') return
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const scrollHeight = textarea.scrollHeight
    textarea.style.height = `${scrollHeight}px`
    const metaHeight = metaRef.current?.offsetHeight ?? 0
    const paddingY = 24 // block padding top+bottom (12px each)
    const gapBetweenMetaAndContent = 10
    const newHeight = paddingY + metaHeight + gapBetweenMetaAndContent + scrollHeight
    onUpdate(block.id, (current) => {
      if (current.type !== 'text') return current
      if (current.height && Math.abs(current.height - newHeight) < 1) return current
      return { ...current, height: newHeight }
    })
  }

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (block.type !== 'image') return
    const img = event.currentTarget
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const ratio = img.naturalHeight / img.naturalWidth
      onUpdate(block.id, (current) => {
        if (current.type !== 'image') return current
        return { ...current, aspectRatio: ratio, height: undefined }
      })
    }
  }

  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onDelete(block.id)
  }

  useEffect(() => {
    adjustTextareaSize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.type === 'text' ? block.text : null])

  const summaryToPlainText = (summaryBlock: Extract<Block, { type: 'summary' }>) => {
    const lines = [
      summaryBlock.title,
      '',
      'What this area is about',
      summaryBlock.sections.what,
      '',
      'Key decisions',
      summaryBlock.sections.decisions,
      '',
      'Constraints',
      summaryBlock.sections.constraints,
      '',
      'Assumptions / open questions',
      summaryBlock.sections.assumptions,
      '',
      'Evidence',
      summaryBlock.evidenceBlockIds.map((id) => `block:${id}`).join(', '),
    ]
    return lines.join('\n')
  }

  const handleCopySummary = async (
    event: MouseEvent<HTMLButtonElement>,
    summaryBlock: Extract<Block, { type: 'summary' }>
  ) => {
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(summaryToPlainText(summaryBlock))
    } catch (err) {
      console.warn('Clipboard copy failed', err)
    }
  }

  const renderedHeight =
    block.type === 'image'
      ? getImageHeight(block)
      : block.height

  const style: React.CSSProperties = {
    left: block.x,
    top: block.y,
    width: block.width,
    ...(renderedHeight ? { height: renderedHeight } : {}),
  }

  return (
    <div
      className={`block block-${block.type} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''} ${selected ? 'selected' : ''} ${highlight ? 'highlight' : ''} ${dimmed ? 'dimmed' : ''} ${(isEditingText || isEditingLink || isEditingImage) ? 'editing' : ''}`}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="block-meta block-drag-handle" ref={metaRef}>
        <div className="block-meta-left">
          <span className="block-type">{block.type}</span>
          <span className="block-id">{block.id}</span>
        </div>
        <button
          className="block-delete"
          onClick={handleDeleteClick}
          onPointerDown={(e) => e.stopPropagation()}
        >
          Delete
        </button>
      </div>

      {block.type === 'text' && (
        <textarea
          className="block-textarea"
          onFocus={() => setIsEditingText(true)}
          onBlur={() => setIsEditingText(false)}
          value={block.text}
          ref={textareaRef}
          onChange={(e) => {
            if (block.type !== 'text') return
            const textarea = textareaRef.current
            if (textarea) {
              textarea.style.height = 'auto'
              textarea.style.height = `${textarea.scrollHeight}px`
            }
            onUpdate(block.id, (current) => {
              if (current.type !== 'text') return current
              return {
                ...current,
                text: e.target.value,
              }
            })
            adjustTextareaSize()
          }}
        />
      )}

      {block.type === 'image' && (
        <div className="block-image">
          {!isEditingImage && (
            <>
              {!imageError ? (
                <img src={block.src} alt={block.id} onError={() => setImageError(true)} onLoad={handleImageLoad} />
              ) : (
                <div className="block-image-placeholder">Image failed to load</div>
              )}
              <button
                className="block-edit"
                onClick={(e) => {
                  e.stopPropagation()
                  imageDraft.current = { src: block.src }
                  setIsEditingImage(true)
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                Edit
              </button>
            </>
          )}
          {isEditingImage && (
            <div className="block-edit-form">
              <label>
                Image URL
                <input
                  type="text"
                  defaultValue={block.src}
                  onChange={(e) => (imageDraft.current.src = e.target.value)}
                />
              </label>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onUpdate(block.id, (current) => {
                    if (current.type !== 'image') return current
                    return {
                      ...current,
                      src: imageDraft.current.src || current.src,
                    }
                  })
                  setImageError(false)
                  setIsEditingImage(false)
                }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}

      {block.type === 'link' && (
        <div className="block-link-wrap">
          {!isEditingLink ? (
            <>
              <a className="block-link" href={block.url} target="_blank" rel="noreferrer" onClick={handleLinkClick}>
                {block.label}
              </a>
              <button
                className="block-edit"
                onClick={(e) => {
                  e.stopPropagation()
                  linkDraft.current = { label: block.label, url: block.url }
                  setIsEditingLink(true)
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                Edit
              </button>
            </>
          ) : (
            <div className="block-edit-form">
              <label>
                Label
                <input
                  type="text"
                  defaultValue={block.label}
                  onChange={(e) => (linkDraft.current.label = e.target.value)}
                />
              </label>
              <label>
                URL
                <input
                  type="text"
                  defaultValue={block.url}
                  onChange={(e) => (linkDraft.current.url = e.target.value)}
                />
              </label>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onUpdate(block.id, (current) => {
                    if (current.type !== 'link') return current
                    return {
                      ...current,
                      label: linkDraft.current.label || current.label,
                      url: linkDraft.current.url || current.url,
                    }
                  })
                  setIsEditingLink(false)
                }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}

      {block.type === 'summary' && (
        <div className="block-summary">
          <div className="summary-header">
            <div className="summary-title">
              <span className="summary-badge">Summary</span>
              <h3>{block.title}</h3>
            </div>
            <button
              className="copy-summary"
              onClick={(e) => handleCopySummary(e, block)}
              onPointerDown={(e) => e.stopPropagation()}
            >
              Copy summary
            </button>
          </div>
          <div className="summary-body">
            <div className="summary-section">
              <p className="summary-label">What</p>
              <p className="summary-text">{block.sections.what}</p>
            </div>
            <div className="summary-section">
              <p className="summary-label">Decisions</p>
              <p className="summary-text">{block.sections.decisions}</p>
            </div>
            <div className="summary-section">
              <p className="summary-label">Constraints</p>
              <p className="summary-text">{block.sections.constraints}</p>
            </div>
            <div className="summary-section">
              <p className="summary-label">Assumptions</p>
              <p className="summary-text">{block.sections.assumptions}</p>
            </div>
            <div className="summary-evidence">
              <p className="summary-label">Evidence</p>
              <p className="summary-text">{block.evidenceBlockIds.map((id) => `block:${id}`).join(', ')}</p>
            </div>
          </div>
        </div>
      )}

      <div
        className="block-resize-handle"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
      />
    </div>
  )
}
