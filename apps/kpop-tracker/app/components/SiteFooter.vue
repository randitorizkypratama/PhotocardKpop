<template>
  <footer class="border-t border-zinc-200 bg-card dark:border-zinc-800">
    <div class="page-shell flex flex-col gap-6 py-10 sm:py-12">
      <div class="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div class="max-w-sm">
          <div class="flex items-center gap-2.5">
            <img src="/hibikishop-logo.png" alt="HIBIKISHOP" class="h-9 w-9 rounded-full object-contain" />
            <div class="leading-tight">
              <span class="block text-sm font-semibold text-foreground">HIBIKISHOP</span>
              <span class="block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Photocards</span>
            </div>
          </div>
          <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
            K-pop photocard catalog &amp; collection tracker.
          </p>
          <div class="mt-4">
            <SocialLinks size="sm" />
          </div>
        </div>

        <nav class="flex flex-col gap-2.5" aria-label="Footer">
          <NuxtLink to="/browse" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Browse</NuxtLink>
          <NuxtLink to="/#groups" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Groups</NuxtLink>
          <NuxtLink to="/collection" class="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Collection</NuxtLink>
        </nav>
      </div>

      <Separator />

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-xs text-muted-foreground">
          © {{ year }} Copyright by
          <span class="font-medium text-foreground">HIBIKISHOP</span>
          · Data based on
          <a
            href="https://pocamarket.com"
            target="_blank"
            rel="noopener noreferrer"
            class="font-medium text-foreground underline-offset-2 hover:underline"
          >POCAMARKET</a>
        </p>
        <p class="text-xs text-muted-foreground">K-Pop Photocard Tracker</p>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
const year = new Date().getFullYear()
</script>
