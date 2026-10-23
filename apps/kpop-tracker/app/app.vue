<template>
  <div class="min-h-screen bg-background text-foreground">
    <NuxtRouteAnnouncer />
    <NuxtPage :transition="{ name: 'page', mode: 'out-in' }" />
    <!-- Rendered only while open so reka-ui Command/Dialog stay out of the
         entry chunk; the Cmd/Ctrl+K listener lives in app.vue below. -->
    <LazyCommandPalette v-if="paletteOpen" />
  </div>
</template>

<script setup lang="ts">
const { init } = useDarkMode()
const paletteOpen = useState('command-palette-open', () => false)

onMounted(() => init())

onMounted(() => window.addEventListener('keydown', onPaletteKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onPaletteKeydown))

function onPaletteKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    paletteOpen.value = !paletteOpen.value
  }
}
</script>
