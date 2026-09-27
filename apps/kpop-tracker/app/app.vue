<template>
  <div class="min-h-screen bg-background text-foreground">
    <NuxtRouteAnnouncer />
    <NuxtPage />
    <CommandPalette />
  </div>
</template>

<script setup lang="ts">
const { init } = useDarkMode()
onMounted(() => init())
</script>
