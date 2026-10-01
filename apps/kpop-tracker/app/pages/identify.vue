<script setup lang="ts">
import { ArrowRight, Camera, Lightbulb, Loader2, RefreshCcw, SearchX, Upload } from 'lucide-vue-next'
import {
  LOW_CONFIDENCE_FLOOR,
  NOT_FOUND_FLOOR,
  searchByPhoto,
  type PhotoSearchResult,
  type SearchStage,
} from '@/lib/photoSearch'
import { groupDot } from '@/lib/catalog'

useHead({ title: 'Identify Photocard — HIBIKISHOP PC' })
useSeoMeta({
  ogTitle: 'Identify a photocard from a photo — HIBIKISHOP PC',
  ogDescription:
    'Snap or upload a photo of your physical K-pop photocard and match it against the full card database — right in your browser.',
  ogUrl: 'https://kpop-tracker-six.vercel.app/identify',
})

const { t } = useLocale()

type Phase = 'idle' | 'working' | 'results' | 'notfound' | 'error'
const phase = ref<Phase>('idle')
const stage = ref<SearchStage>('model')
const previewUrl = ref<string | null>(null)
const result = ref<PhotoSearchResult | null>(null)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const cameraInput = ref<HTMLInputElement | null>(null)
let searchSeq = 0

const lowConfidence = computed(
  () => phase.value === 'results' && (result.value?.topScore ?? 1) < LOW_CONFIDENCE_FLOOR,
)

const stageKey = computed(
  () => `identify.stage${stage.value.charAt(0).toUpperCase()}${stage.value.slice(1)}`,
)

onBeforeUnmount(() => {
  searchSeq++
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

function openPicker(kind: 'file' | 'camera') {
  ;(kind === 'file' ? fileInput.value : cameraInput.value)?.click()
}

async function onFile(file: File | null | undefined) {
  if (!file) return
  if (!file.type.startsWith('image/')) {
    phase.value = 'error'
    return
  }
  const seq = ++searchSeq
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)
  result.value = null
  phase.value = 'working'
  stage.value = 'model'
  try {
    const res = await searchByPhoto(file, (s) => {
      if (seq === searchSeq) stage.value = s
    })
    if (seq !== searchSeq) return
    result.value = res
    phase.value = res.topScore >= NOT_FOUND_FLOOR ? 'results' : 'notfound'
  } catch (e) {
    console.error('photo identify failed:', e)
    if (seq !== searchSeq) return
    phase.value = 'error'
  }
}

function onInputEvent(e: Event) {
  const input = e.target as HTMLInputElement
  void onFile(input.files?.[0] ?? null)
  input.value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  void onFile(e.dataTransfer?.files?.[0] ?? null)
}

function reset() {
  searchSeq++
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
  result.value = null
  phase.value = 'idle'
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <AppHeader active="browse" />

    <main class="page-shell py-8 sm:py-12">
      <div class="mx-auto max-w-3xl">
        <!-- Intro -->
        <div class="text-center">
          <p class="eyebrow">{{ t('identify.eyebrow') }}</p>
          <h1 class="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {{ t('identify.title') }}
          </h1>
          <p class="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {{ t('identify.desc') }}
          </p>
        </div>

        <!-- Dropzone / preview -->
        <div
          class="mt-7 rounded-2xl border-2 border-dashed transition-colors duration-150"
          :class="
            dragging
              ? 'border-zinc-500 bg-zinc-50 dark:border-zinc-400 dark:bg-zinc-900/60'
              : 'border-zinc-300 bg-card dark:border-zinc-700'
          "
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <!-- Empty state -->
          <div v-if="!previewUrl" class="px-6 py-10 text-center sm:py-14">
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <Camera class="h-7 w-7 text-muted-foreground" />
            </div>
            <p class="mt-4 text-sm font-medium text-foreground sm:text-base">
              {{ t('identify.dropTitle') }}
            </p>
            <div class="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <Button class="gap-2 rounded-lg" @click="openPicker('camera')">
                <Camera class="h-4 w-4" />
                {{ t('identify.btnCamera') }}
              </Button>
              <Button variant="outline" class="gap-2 rounded-lg" @click="openPicker('file')">
                <Upload class="h-4 w-4" />
                {{ t('identify.btnUpload') }}
              </Button>
            </div>
            <p class="mt-5 text-xs text-muted-foreground">{{ t('identify.privacy') }}</p>
          </div>

          <!-- Photo selected: preview + status -->
          <div v-else class="p-4 sm:p-5">
            <div class="flex items-start gap-4">
              <img
                :src="previewUrl!"
                :alt="t('identify.ownPhoto')"
                class="h-28 w-[73px] shrink-0 rounded-lg border border-zinc-200 object-cover sm:h-36 sm:w-[95px] dark:border-zinc-700"
              />
              <div class="min-w-0 flex-1">
                <div v-if="phase === 'working'" class="flex h-full flex-col justify-center gap-2">
                  <div class="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
                    <span class="truncate">{{ t(stageKey) }}</span>
                  </div>
                  <div class="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      class="h-full rounded-full bg-zinc-500 transition-all duration-500 dark:bg-zinc-400"
                      :style="{
                        width:
                          stage === 'model' ? '33%' : stage === 'index' ? '66%' : '90%',
                      }"
                    />
                  </div>
                </div>
                <div v-else class="flex h-full flex-col justify-center gap-3">
                  <p class="text-sm font-medium text-foreground">
                    {{ phase === 'results' ? t('identify.resultsTitle') : '' }}
                    {{ phase === 'notfound' ? t('identify.notFoundTitle') : '' }}
                    {{ phase === 'error' ? t('identify.errorTitle') : '' }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" class="gap-1.5 rounded-lg" @click="reset()">
                      <RefreshCcw class="h-3.5 w-3.5" />
                      {{ t('identify.btnAgain') }}
                    </Button>
                    <Button size="sm" class="gap-1.5 rounded-lg" @click="openPicker('camera')">
                      <Camera class="h-3.5 w-3.5" />
                      {{ t('identify.btnCamera') }}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          :aria-label="t('identify.ariaFile')"
          @change="onInputEvent"
        />
        <input
          ref="cameraInput"
          type="file"
          accept="image/*"
          capture="environment"
          class="hidden"
          :aria-label="t('identify.ariaCamera')"
          @change="onInputEvent"
        />

        <!-- Low-confidence hint -->
        <div
          v-if="lowConfidence"
          class="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
          role="status"
        >
          {{ t('identify.lowConfidence') }}
        </div>

        <!-- Results -->
        <section v-if="phase === 'results' && result" class="mt-6" :aria-label="t('identify.resultsTitle')">
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            <NuxtLink
              v-for="(hit, i) in result.hits"
              :key="hit.id + '-' + i"
              :to="`/card/${hit.id}`"
              class="group block overflow-hidden rounded-xl border border-zinc-200 bg-card transition-shadow duration-150 hover:shadow-md dark:border-zinc-800"
            >
              <div class="relative aspect-[2/3] overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                <img
                  :src="hit.image"
                  :alt="hit.name"
                  loading="lazy"
                  class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                />
                <span
                  v-if="i === 0"
                  class="absolute left-2 top-2 rounded-full bg-zinc-900/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-zinc-100/90 dark:text-zinc-900"
                >
                  {{ t('identify.bestMatch') }}
                </span>
              </div>
              <div class="p-3">
                <p class="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="groupDot(hit.group_name)" />
                  <span class="truncate">{{ hit.group_name }}</span>
                </p>
                <p class="mt-1 line-clamp-2 text-xs font-medium leading-snug text-foreground sm:text-sm">
                  {{ hit.name }}
                </p>
                <div class="mt-2.5 flex items-center gap-2">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      class="h-full rounded-full bg-zinc-700 dark:bg-zinc-300"
                      :style="{ width: Math.round(hit.score * 100) + '%' }"
                    />
                  </div>
                  <span class="text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {{ Math.round(hit.score * 100) }}%
                  </span>
                </div>
              </div>
            </NuxtLink>
          </div>
        </section>

        <!-- Not found -->
        <section
          v-else-if="phase === 'notfound'"
          class="mt-6 rounded-xl border border-zinc-200 bg-card px-5 py-6 text-center dark:border-zinc-800"
          role="status"
        >
          <SearchX class="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 class="mt-3 text-base font-semibold text-foreground">{{ t('identify.notFoundTitle') }}</h2>
          <p class="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
            {{ t('identify.notFoundDesc') }}
          </p>
        </section>

        <!-- Error -->
        <section
          v-else-if="phase === 'error'"
          class="mt-6 rounded-xl border border-red-300 bg-red-50 px-5 py-6 text-center dark:border-red-800/60 dark:bg-red-950/40"
          role="alert"
        >
          <h2 class="text-base font-semibold text-red-900 dark:text-red-200">
            {{ t('identify.errorTitle') }}
          </h2>
          <p class="mx-auto mt-1.5 max-w-md text-sm text-red-800/90 dark:text-red-300">
            {{ t('identify.errorDesc') }}
          </p>
        </section>

        <!-- Tips -->
        <section class="mt-8 rounded-xl border border-zinc-200 bg-card p-5 dark:border-zinc-800">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lightbulb class="h-4 w-4 text-muted-foreground" />
            {{ t('identify.tipsTitle') }}
          </h2>
          <ul class="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li class="flex gap-2"><span class="text-zinc-400">•</span>{{ t('identify.tipFill') }}</li>
            <li class="flex gap-2"><span class="text-zinc-400">•</span>{{ t('identify.tipLight') }}</li>
            <li class="flex gap-2"><span class="text-zinc-400">•</span>{{ t('identify.tipGlare') }}</li>
            <li class="flex gap-2"><span class="text-zinc-400">•</span>{{ t('identify.tipStraight') }}</li>
          </ul>
          <NuxtLink
            to="/browse"
            class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-2 hover:underline"
          >
            {{ t('identify.browseInstead') }}
            <ArrowRight class="h-3.5 w-3.5" />
          </NuxtLink>
        </section>
      </div>
    </main>

    <MobileTabBar />
  </div>
</template>
