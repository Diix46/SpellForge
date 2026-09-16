<script setup lang="ts">
import { computed } from 'vue'

// One Piece rules text, readable at a glance: bracketed timings and keywords
// ("[On Play]", "[Jouée]", "[DON!! x1]") become chips, attribute names
// ("<Slash>") become tags. Rendered as text nodes only: the source is scraped
// and never reaches v-html.
const props = defineProps<{ text: string | null }>()

interface Segment { kind: 'text' | 'chip' | 'tag', value: string, variant?: 'trigger' | 'don' }

function chipVariant(value: string): Segment['variant'] {
  if (/trigger|déclench/i.test(value))
    return 'trigger'
  if (/don!!/i.test(value))
    return 'don'
  return undefined
}

const TOKEN = /(\[[^\]\n]{1,40}\]|<[^>\n]{1,24}>)/g

const lines = computed<Segment[][]>(() => (props.text ?? '').split('\n').map((line) => {
  const out: Segment[] = []
  for (const part of line.split(TOKEN)) {
    if (!part)
      continue
    if (part.startsWith('[') && part.endsWith(']'))
      out.push({ kind: 'chip', value: part.slice(1, -1), variant: chipVariant(part) })
    else if (part.startsWith('<') && part.endsWith('>'))
      out.push({ kind: 'tag', value: part.slice(1, -1) })
    else out.push({ kind: 'text', value: part })
  }
  return out
}))
</script>

<template>
  <div class="effect">
    <p v-for="(segments, i) in lines" :key="i" class="effect-line">
      <template v-for="(s, j) in segments" :key="j">
        <span v-if="s.kind === 'chip'" class="chip" :class="s.variant">{{ s.value }}</span>
        <span v-else-if="s.kind === 'tag'" class="tag">{{ s.value }}</span>
        <template v-else>
          {{ s.value }}
        </template>
      </template>
    </p>
  </div>
</template>

<style scoped>
.effect {
  display: grid;
  gap: 6px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--color-text-mid);
}
.effect-line {
  margin: 0;
}
.chip {
  display: inline-block;
  margin: 0 2px;
  padding: 0 6px;
  border-radius: 3px;
  background: #231708;
  color: #fbf4e6;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.6;
  vertical-align: 1px;
}
.chip.don {
  background: #231708;
  color: #e9c270;
}
.chip.trigger {
  background: #d9a91c;
  color: #231708;
}
.tag {
  display: inline-block;
  margin: 0 2px;
  padding: 0 5px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  font-size: 11.5px;
  line-height: 1.5;
}
</style>
