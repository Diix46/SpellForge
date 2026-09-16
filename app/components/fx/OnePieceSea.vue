<script setup lang="ts">
// One Piece backdrop: the Grand Line at the foot of the page. Waves, a small
// ship riding them and two gulls, drawn in sepia ink over the paper. Fixed,
// behind everything, never interactive, and still under reduced motion.
</script>

<template>
  <div class="sea" aria-hidden="true">
    <svg class="gull g1" viewBox="0 0 40 20">
      <path d="M2 12C7 4 12 4 20 11c8-7 13-7 18 1" />
    </svg>
    <svg class="gull g2" viewBox="0 0 40 20">
      <path d="M2 12C7 4 12 4 20 11c8-7 13-7 18 1" />
    </svg>
    <svg class="ship" viewBox="0 0 80 80">
      <path d="M14 56h52l-7 12H21z" fill="#8a4a20" stroke="#3a2616" stroke-width="2" />
      <path d="M40 10v46" stroke="#3a2616" stroke-width="2.5" />
      <path d="M40 14l20 12-20 9z" fill="#fff8ec" stroke="#3a2616" stroke-width="2" />
      <path d="M40 38l-18 10 18 6z" fill="#f2e4c9" stroke="#3a2616" stroke-width="2" />
      <circle cx="40" cy="8" r="4" fill="#c9312a" stroke="#3a2616" stroke-width="1.6" />
    </svg>
    <svg class="waves" viewBox="0 0 400 120" preserveAspectRatio="none">
      <path class="w1" d="M0 44c22-11 44-11 66 0s44 11 66 0 44-11 66 0 44 11 66 0 44-11 66 0 44 11 66 0" />
      <path class="w2" d="M0 66c22-11 44-11 66 0s44 11 66 0 44-11 66 0 44 11 66 0 44-11 66 0 44 11 66 0" />
      <path class="w1 w3" d="M0 88c22-11 44-11 66 0s44 11 66 0 44-11 66 0 44 11 66 0 44-11 66 0 44 11 66 0" />
    </svg>
  </div>
</template>

<style scoped>
.sea {
  position: fixed;
  inset: 0;
  z-index: var(--z-background);
  overflow: hidden;
  pointer-events: none;
}
.waves {
  position: absolute;
  left: -10%;
  right: -10%;
  bottom: -18px;
  width: 120%;
  height: 120px;
  opacity: 0.32;
}
.waves path {
  fill: none;
  stroke: var(--u-sea);
  stroke-width: 2.5;
  stroke-linecap: round;
}
.w2 {
  opacity: 0.65;
  animation: sail 11s ease-in-out infinite alternate-reverse;
}
.w1 {
  animation: sail 9s ease-in-out infinite alternate;
}
.w3 {
  opacity: 0.45;
}
.ship {
  position: absolute;
  right: 7%;
  bottom: 46px;
  width: 64px;
  opacity: 0.5;
  animation: bob 5.5s ease-in-out infinite alternate;
}
.gull {
  position: absolute;
  top: 18%;
  width: 22px;
  opacity: 0.35;
  animation: fly 26s linear infinite;
}
.gull path {
  fill: none;
  stroke: #3a2616;
  stroke-width: 2;
  stroke-linecap: round;
}
.g2 {
  top: 26%;
  width: 16px;
  animation-duration: 34s;
  animation-delay: -12s;
}
@keyframes sail {
  from {
    transform: translateX(-2%);
  }
  to {
    transform: translateX(2%);
  }
}
@keyframes bob {
  from {
    transform: translateY(0) rotate(-2.5deg);
  }
  to {
    transform: translateY(-8px) rotate(2.5deg);
  }
}
@keyframes fly {
  from {
    transform: translateX(-10vw) translateY(0);
  }
  50% {
    transform: translateX(50vw) translateY(-18px);
  }
  to {
    transform: translateX(110vw) translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .waves path,
  .ship,
  .gull {
    animation: none;
  }
  .gull {
    display: none;
  }
}
</style>
