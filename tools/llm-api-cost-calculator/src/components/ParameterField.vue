<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  id: string
  label: string
  modelValue: string
  unit: string
  step?: number
  min?: number
  max?: number
  error?: string
}>(), {
  step: 1,
  min: 0,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const parsedValue = computed(() => Number(props.modelValue))

function adjust(direction: -1 | 1) {
  const current = Number.isFinite(parsedValue.value) ? parsedValue.value : 0
  const next = current + props.step * direction
  const bounded = Math.max(props.min, props.max === undefined ? next : Math.min(props.max, next))
  const fractionDigits = `${props.step}`.split('.')[1]?.length ?? 0
  emit('update:modelValue', bounded.toFixed(fractionDigits))
}
</script>

<template>
  <div class="parameter-field" :class="{ 'is-invalid': error }">
    <div class="field-heading">
      <label :for="id">{{ label }}</label>
      <span class="field-unit">{{ unit }}</span>
    </div>
    <div class="stepper">
      <button
        class="step-button"
        type="button"
        :aria-label="`减少${label}`"
        @click="adjust(-1)"
      >−</button>
      <input
        :id="id"
        :value="modelValue"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        maxlength="40"
        :aria-invalid="Boolean(error)"
        :aria-describedby="error ? `${id}-error` : undefined"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      >
      <button
        class="step-button"
        type="button"
        :aria-label="`增加${label}`"
        @click="adjust(1)"
      >+</button>
    </div>
    <p v-if="error" :id="`${id}-error`" class="field-error" role="status">{{ error }}</p>
  </div>
</template>
