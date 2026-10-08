import { createItemSchema } from '@stylify/shared'
import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { Image } from 'expo-image'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { errorMessage } from '@/components/ErrorState'
import { pickPhoto, type PhotoSource } from '@/lib/photo'

export type ItemFields = { name: string; type: string; size: string; color: string }

type Props = {
  initial?: ItemFields
  // The saved image when editing; undefined when adding.
  currentImageUrl?: string
  submitLabel: string
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

export function ItemForm({ initial, currentImageUrl, submitLabel, onSubmit }: Props) {
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shownImage = photoUri ?? currentImageUrl

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
    <ScrollView className="flex-1 bg-white" contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled">
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
            <View className="gap-1">
              <Text className="text-sm font-medium text-neutral-700">{label}</Text>
              <TextInput
                className="rounded-lg border border-neutral-300 px-3 py-3 text-base"
                value={field.state.value}
                onBlur={field.handleBlur}
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
    </ScrollView>
  )
}
