<script setup lang="ts">
import { Sun, Moon } from 'lucide-vue-next'

const { isDark, toggle } = useDarkMode()
const { t } = useLocale()
</script>

<template>
  <Button
    variant="ghost"
    size="icon-sm"
    class="rounded-lg"
    :aria-label="isDark ? t('aria.switchLight') : t('aria.switchDark')"
    @click="toggle"
  >
    <Sun v-if="isDark" class="h-4 w-4" />
    <Moon v-else class="h-4 w-4" />
  </Button>
</template>
