<template>
  <div class="min-h-screen">
    <NuxtRouteAnnouncer />
    <NuxtPage />
    <Analytics />
  </div>
</template>

<script setup lang="ts">
import { Analytics } from '@vercel/analytics/vue'
</script>
