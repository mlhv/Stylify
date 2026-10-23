import { Ionicons } from '@expo/vector-icons'
import { createItemSchema } from '@stylify/shared'
import { colors, typeColors, typeKey } from '@stylify/shared/brand'
import { useForm } from '@tanstack/react-form'
import { zodValidator } from '@tanstack/zod-form-adapter'
import { Image } from 'expo-image'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Keyboard, ScrollView, TextInput, View } from 'react-native'

import { ClassifierLine } from '@/components/ClassifierLine'
import { errorMessage } from '@/components/ErrorState'
import { ChunkyButton } from '@/components/ui/ChunkyButton'
import { Txt } from '@/components/ui/Txt'
import { TypeChip } from '@/components/ui/TypeChip'
import { pickPhoto, type PhotoSource } from '@/lib/photo'
import { decide } from '@/lib/suggestion'
import { useTypeSuggestion } from '@/lib/useTypeSuggestion'

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
// `missing` replaces the shared schema's message, as on the web: its only rule per field is
// "not empty", so any error on a field means it was left blank.
const FIELDS = [
  { name: 'name', label: 'Name', placeholder: 'Zip hoodie', missing: 'Give it a name' },
  { name: 'type', label: 'Type', placeholder: 'Like Top or Shoes', missing: 'Pick a type or type your own' },
  { name: 'size', label: 'Size', placeholder: 'Like M or 32', missing: 'What size is it?' },
  { name: 'color', label: 'Colour', placeholder: 'Like black', missing: 'What colour is it?' },
] as const
// The Type placeholder while the classifier's chips are showing.
const TYPE_PLACEHOLDER_WITH_CHIPS = 'Type it or pick a chip'

// The neutral bottom edge closet tiles have.
const TILE_EDGE = { borderBottomWidth: 5, borderBottomColor: 'rgba(0,0,0,0.08)' } as const

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
  // The same, as state, for the coral border on the focused field.
  const [focusedName, setFocusedName] = useState<string | null>(null)

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

  // Type suggestions. onResult reads the field when the classifier finishes, so a type typed in the meantime is kept.
  const [chips, setChips] = useState<string[]>([])
  const lastPrefill = useRef<string | null>(null)
  // What the latest run put in the field, for the line above the chips; null when it was not sure.
  const [prefilledThisRun, setPrefilledThisRun] = useState<string | null>(null)
  // setFieldValue does not run the field's validators, so an old error would stay under the new value.
  function setType(value: string) {
    form.setFieldValue('type', value)
    void form.validateField('type', 'change')
  }

  const { pending, start } = useTypeSuggestion((result) => {
    const d = decide(result.predictions, result.threshold, form.getFieldValue('type'), lastPrefill.current)
    if (d.prefill) {
      setType(d.prefill)
      lastPrefill.current = d.prefill
    }
    setPrefilledThisRun(d.prefill)
    setChips(d.chips)
  })

  async function choose(source: PhotoSource) {
    try {
      const uri = await pickPhoto(source)
      if (uri) {
        setPhotoUri(uri)
        setChips([])
        start(uri)
        setError(null)
      }
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <View ref={frameRef} collapsable={false} className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-[18px] pb-6 pt-1"
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y
        }}
        onLayout={(event) => {
          viewHeight.current = event.nativeEvent.layout.height
        }}>
        <form.Subscribe selector={(state) => state.values.type}>
          {(type) => <PhotoTile uri={shownImage} backgroundColor={typeColors[typeKey(type)].bg} />}
        </form.Subscribe>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <ChunkyButton label="Take photo" icon="camera" variant="secondary" onPress={() => void choose('camera')} />
          </View>
          <View className="flex-1">
            <ChunkyButton label="Choose photo" icon="images" variant="secondary" onPress={() => void choose('library')} />
          </View>
        </View>

        {FIELDS.map(({ name, label, placeholder, missing }) => (
          <form.Field key={name} name={name} validators={{ onChange: createItemSchema.shape[name] }}>
            {(field) => (
              <View
                className="gap-1.5"
                onLayout={(event) => {
                  fieldBox.current[name] = { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height }
                }}>
                <Txt weight="heavy" className="text-[13px] text-muted">
                  {label}
                </Txt>
                <TextInput
                  style={{
                    backgroundColor: colors.white,
                    borderRadius: 14,
                    borderWidth: 2,
                    borderColor: focusedName === name ? colors.coral : colors.line,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontFamily: 'Nunito_700Bold',
                    fontSize: 16,
                    color: colors.ink,
                  }}
                  placeholder={name === 'type' && chips.length ? TYPE_PLACEHOLDER_WITH_CHIPS : placeholder}
                  placeholderTextColor={colors.muted}
                  cursorColor={colors.coral}
                  selectionColor={colors.coral}
                  value={field.state.value}
                  onFocus={() => {
                    focusedField.current = name
                    setFocusedName(name)
                    // Moving from one field to another with the keyboard already up.
                    if (keyboardInset > 0) revealFocusedField(keyboardInset)
                  }}
                  onBlur={() => {
                    // Only if this field still owns the focus: moving to another field has already set it.
                    if (focusedField.current === name) focusedField.current = null
                    setFocusedName((current) => (current === name ? null : current))
                    field.handleBlur()
                  }}
                  onChangeText={field.handleChange}
                  accessibilityLabel={label}
                />
                {field.state.meta.isTouched && field.state.meta.errors.length ? (
                  <Txt className="text-[13px] text-danger">{missing}</Txt>
                ) : null}
                {name === 'type' && (pending || chips.length) ? (
                  <View className="gap-1 pt-1">
                    <ClassifierLine pending={pending} hasChips={chips.length > 0} prefilled={prefilledThisRun} />
                    {!pending && chips.length ? (
                      <View className="flex-row flex-wrap gap-2">
                        {chips.map((chip, index) => (
                          <TypeChip
                            key={chip}
                            type={typeKey(chip)}
                            label={chip}
                            index={index}
                            selected={field.state.value === chip}
                            onPress={() => {
                              lastPrefill.current = null
                              setType(chip)
                            }}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )}
          </form.Field>
        ))}

        {error ? <Txt className="text-[14px] text-danger">{error}</Txt> : null}

        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            // canSubmit is false while submitting; that is busy, not disabled.
            <ChunkyButton
              label={submitLabel}
              busy={isSubmitting}
              disabled={!canSubmit && !isSubmitting}
              onPress={() => void form.handleSubmit()}
            />
          )}
        </form.Subscribe>
        {footer}
        {keyboardInset > 0 ? <View style={{ height: keyboardInset }} /> : null}
      </ScrollView>
    </View>
  )
}

/** The square photo tile: the chosen or saved photo on its type's colour, or an invitation to add one. */
function PhotoTile({ uri, backgroundColor }: { uri: string | undefined; backgroundColor: string }) {
  return (
    <View
      style={{
        aspectRatio: 1,
        width: '100%',
        borderRadius: 22,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: uri ? backgroundColor : colors.line,
        ...TILE_EDGE,
      }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel="Photo of your piece" />
      ) : (
        <View className="items-center gap-2">
          <Ionicons name="camera" size={44} color={colors.muted} />
          <Txt weight="heavy" className="text-[15px] text-muted">
            Add a photo of your piece
          </Txt>
        </View>
      )}
    </View>
  )
}
