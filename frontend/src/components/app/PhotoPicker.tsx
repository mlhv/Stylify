import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isHeicFile, prepareImage } from '@/lib/photo'
import { ChunkyButton } from './ChunkyButton'

// A square photo tile: click or drop an image on it. Shows `previewUrl` until a
// file is chosen, then the chosen file.
export function PhotoPicker({
  previewUrl,
  onChange,
}: {
  previewUrl?: string
  onChange: (file: File | undefined) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [chosenUrl, setChosenUrl] = useState<string | undefined>(undefined)
  const [dragging, setDragging] = useState(false)
  const [broken, setBroken] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [failed, setFailed] = useState(false)
  // Only the latest pick may land, if an earlier one is still converting.
  const pickId = useRef(0)

  const shownUrl = chosenUrl ?? previewUrl

  // Revoke the object URL when it is replaced or the picker unmounts.
  useEffect(() => {
    if (!chosenUrl) return
    return () => URL.revokeObjectURL(chosenUrl)
  }, [chosenUrl])

  useEffect(() => {
    setBroken(false)
  }, [shownUrl])

  const choose = async (picked: File | undefined) => {
    if (!picked) return
    const id = ++pickId.current
    setFailed(false)
    setPreparing(isHeicFile(picked))
    try {
      const file = await prepareImage(picked)
      if (id !== pickId.current || !file) return
      setChosenUrl(URL.createObjectURL(file))
      onChange(file)
    } catch {
      if (id === pickId.current) setFailed(true)
    } finally {
      if (id === pickId.current) setPreparing(false)
    }
  }

  const open = () => inputRef.current?.click()

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    void choose(e.dataTransfer.files?.[0])
  }

  const dragProps = {
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  }

  const hasPhoto = !!shownUrl && !broken && !preparing

  return (
    <div
      {...dragProps}
      className={cn(
        'relative aspect-square w-full overflow-hidden rounded-[20px]',
        hasPhoto ? 'bg-line' : 'border-[3px] border-dashed border-line bg-white',
        dragging && 'ring-4 ring-coral ring-offset-2 ring-offset-cream',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          void choose(e.target.files?.[0])
          // Let the same file be picked again after a change.
          e.target.value = ''
        }}
      />
      {hasPhoto ? (
        <>
          <img
            src={shownUrl}
            alt="Your piece"
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
          <div className="absolute inset-x-0 bottom-0 flex justify-center p-4">
            <ChunkyButton variant="secondary" onClick={open}>
              <Camera className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              Change photo
            </ChunkyButton>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={open}
          className={cn(
            'flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-muted',
            'hover:text-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-coral',
          )}
        >
          <Camera className={cn('h-12 w-12', preparing && 'animate-pulse')} strokeWidth={2.5} aria-hidden />
          <span className="text-base font-extrabold" aria-live="polite">
            {preparing
              ? 'Getting your photo ready…'
              : failed
                ? "Couldn't read that photo. Try another?"
                : 'Add a photo — click or drop it here'}
          </span>
        </button>
      )}
    </div>
  )
}
