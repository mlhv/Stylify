import { createItemSchema } from '@stylify/shared'
import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { Image } from 'expo-image'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { errorMessage } from '@/components/ErrorState'
import { pickPhoto, type PhotoSource } from '@/lib/photo'

export type ItemFields = { name: string; type: string; size: string; color: string }

type Props = {
  initial?: ItemFields
  // The saved image when editing; undefined when adding.
  currentImageUrl?: string
  submitLabel: string
  // Extra controls (such as Delete) shown inside the scroll view, so the keyboard cannot hide them.
  footer?: ReactNode
  // newPhotoUri is a local JPEG the user just chose, or null to keep currentImageUrl.
  onSubmit: (fields: ItemFields, newPhotoUri: string | null) => Promise<void>
}

const EMPTY: ItemFields = { name: '', type: '', size: '', color: '' }
const FIELDS = [
  { name: 'name', label: 'Name' },
  { name: 'type', label: 'Type' },
  { name: 'size', label: 'Size' },
  { name: 'color', label: 'Colour' },
] as const

export function ItemForm({ initial, currentImageUrl, submitLabel, footer, onSubmit }: Props) {
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shownImage = photoUri ?? currentImageUrl

  // Keyboard handling. React Native's automaticallyAdjustKeyboardInsets did not leave the
  // bottom of the form reachable on the phone, so the form does it itself: while the keyboard
  // is up, a spacer as tall as the part of the scroll view it covers is added to the content,
  // so the last control can be scrolled above the keyboard. Scrolling never closes the keyboard.
  const frameRef = useRef<View>(null)
  const scrollRef = useRef<ScrollView>(null)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const scrollY = useRef(0)
  const viewHeight = useRef(0)
  const fieldBox = useRef<Partial<Record<string, { y: number; height: number }>>>({})
  const focusedField = useRef<string | null>(null)

  function revealFocusedField(inset: number) {
    const box = focusedField.current ? fieldBox.current[focusedField.current] : undefined
    if (!box) return
    const visibleHeight = viewHeight.current - inset
    const margin = 16
    if (box.y - margin < scrollY.current) {
      scrollRef.current?.scrollTo({ y: Math.max(0, box.y - margin), animated: true })
    } else if (box.y + box.height + margin > scrollY.current + visibleHeight) {
      scrollRef.current?.scrollTo({ y: box.y + box.height + margin - visibleHeight, animated: true })
    }
  }

  useEffect(() => {
    // keyboardWillChangeFrame is iOS-only (this app is iPhone-only).
    const sub = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      frameRef.current?.measureInWindow((_x, y, _width, height) => {
        setKeyboardInset(Math.max(0, y + height - event.endCoordinates.screenY))
      })
    })
    return () => sub.remove()
  }, [])

  // Runs once the spacer is in place, so the scroll can reach far enough.
  useEffect(() => {
    if (keyboardInset > 0) revealFocusedField(keyboardInset)
  }, [keyboardInset])

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: initial ?? EMPTY,
    onSubmit: async ({ value }) => {
      if (!shownImage) {
        setError('Add a photo first')
        return
      }
      setError(null)
      try {
        await onSubmit(value, photoUri)
      } catch (e) {
        // The form stays filled in, so pressing the button again is the retry.
        setError(errorMessage(e))
      }
    },
  })

  async function choose(source: PhotoSource) {
    try {
      const uri = await pickPhoto(source)
      if (uri) {
        setPhotoUri(uri)
        setError(null)
      }
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <View ref={frameRef} collapsable={false} className="flex-1 bg-white">
      <ScrollView
        className="flex-1 bg-white"
        contentContainerClassName="gap-4 p-4"
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y
        }}
        onLayout={(event) => {
          viewHeight.current = event.nativeEvent.layout.height
        }}>
        {shownImage ? (
          <Image source={{ uri: shownImage }} style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }} contentFit="cover" />
        ) : (
          <View className="aspect-square w-full items-center justify-center rounded-xl bg-neutral-100">
            <Text className="text-neutral-500">No photo yet</Text>
          </View>
        )}

        <View className="flex-row gap-3">
          <Pressable className="flex-1 items-center rounded-lg bg-neutral-200 py-3" onPress={() => choose('camera')}>
            <Text className="font-semibold">Take photo</Text>
          </Pressable>
          <Pressable className="flex-1 items-center rounded-lg bg-neutral-200 py-3" onPress={() => choose('library')}>
            <Text className="font-semibold">Choose photo</Text>
          </Pressable>
        </View>

        {FIELDS.map(({ name, label }) => (
          <form.Field key={name} name={name} validators={{ onChange: createItemSchema.shape[name] }}>
            {(field) => (
              <View
                className="gap-1"
                onLayout={(event) => {
                  fieldBox.current[name] = { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height }
                }}>
                <Text className="text-sm font-medium text-neutral-700">{label}</Text>
                <TextInput
                  className="rounded-lg border border-neutral-300 px-3 py-3 text-base"
                  value={field.state.value}
                  onFocus={() => {
                    focusedField.current = name
                    // Moving from one field to another with the keyboard already up.
                    if (keyboardInset > 0) revealFocusedField(keyboardInset)
                  }}
                  onBlur={() => {
                    // Only if this field still owns the focus: moving to another field has already set it.
                    if (focusedField.current === name) focusedField.current = null
                    field.handleBlur()
                  }}
                  onChangeText={field.handleChange}
                  accessibilityLabel={label}
                />
                {field.state.meta.isTouched && field.state.meta.errors.length ? (
                  <Text className="text-sm text-red-600">{field.state.meta.errors.join(', ')}</Text>
                ) : null}
              </View>
            )}
          </form.Field>
        ))}

        {error ? <Text className="text-red-600">{error}</Text> : null}

        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <Pressable
              className={`items-center rounded-lg py-4 ${canSubmit && !isSubmitting ? 'bg-neutral-900' : 'bg-neutral-400'}`}
              disabled={!canSubmit || isSubmitting}
              onPress={() => void form.handleSubmit()}>
              {isSubmitting ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">{submitLabel}</Text>}
            </Pressable>
          )}
        </form.Subscribe>
        {footer}
        {keyboardInset > 0 ? <View style={{ height: keyboardInset }} /> : null}
      </ScrollView>
    </View>
  )
}
