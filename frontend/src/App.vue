<script setup>
import DetailSheet from './components/DetailSheet.vue';
</script>

<template>
  <!-- Dim ambient light behind everything, so the glass has something to
       frost. Static: blurred layers above it never have to repaint. -->
  <div class="ambient" aria-hidden="true"></div>
  <RouterView/>
  <DetailSheet/>
</template>

<style>
.ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(60vw 50vh at 12% 8%, rgb(48 84 168 / 0.20), transparent 70%),
    radial-gradient(55vw 55vh at 92% 38%, rgb(92 64 160 / 0.13), transparent 70%),
    radial-gradient(70vw 50vh at 30% 92%, rgb(24 112 128 / 0.11), transparent 70%),
    var(--base);
}

@media (prefers-reduced-transparency: reduce) {
  .ambient {
    background: var(--base);
  }
}
</style>
