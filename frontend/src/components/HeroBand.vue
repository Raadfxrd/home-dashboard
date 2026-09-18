<script setup>
import {computed} from 'vue';
import AppIcon from './AppIcon.vue';
import RollingNumber from './RollingNumber.vue';

const props = defineProps({
  clock: {type: String, default: ''},
  date: {type: String, default: ''},
  here: {type: Object, default: null},
  away: {type: Object, default: null},
  isLoading: {type: Boolean, default: false},
});

/* OpenWeather's code is only used to pick a glyph from our own set. */
const condIcon = computed(() => {
  const code = props.here?.icon || '';
  if (code.startsWith('09') || code.startsWith('10') || code.startsWith('11')) return 'droplet';
  if (code.startsWith('50')) return 'wind';
  if (code.endsWith('n')) return 'moon';
  if (code.startsWith('01')) return 'sun';
  return 'cloudOff';
});

const hours = computed(() => (props.clock || '').split(':')[0] || '--');
const minutes = computed(() => (props.clock || '').split(':')[1] || '--');
</script>

<template>
  <section class="settle px-6 pb-10 pt-10 md:px-10 md:pb-12 md:pt-14">
    <div class="flex flex-col gap-9 lg:flex-row lg:items-end lg:justify-between lg:gap-14">

      <!-- Time, the thing you are most often here to read. -->
      <div class="min-w-0">
        <h1 class="t-hero t-read flex items-baseline">
          <RollingNumber :value="hours" digit-width="0.57em" fallback="--"/>
          <span class="mx-[-0.015em] text-faint">:</span>
          <RollingNumber :value="minutes" digit-width="0.57em" fallback="--"/>
        </h1>
        <p class="mt-3 text-[1.0625rem] tracking-[-0.015em] text-dim">{{ date }}</p>
      </div>

      <!-- Weather, set as a reading rather than boxed into a card. -->
      <div v-if="isLoading" class="h-16 w-44 animate-pulse rounded-xl bg-raised"></div>

      <div v-else-if="here" class="flex shrink-0 flex-wrap items-end gap-x-12 gap-y-6">
        <div>
          <div class="flex items-start gap-2">
            <span class="t-read text-[2.5rem] font-semibold leading-none tracking-[-0.035em] md:text-[3rem]">
              <RollingNumber :value="here.temperature" suffix="°"/>
            </span>
            <AppIcon :size="19" class="mt-1 text-dim" :name="condIcon"/>
          </div>
          <p class="mt-2.5 text-[1.0625rem] tracking-[-0.015em] text-dim first-letter:uppercase">
            {{ here.condition }}
          </p>
          <p class="mt-1 t-note">
            {{ here.city }}<template v-if="here.feelsLike != null"> · feels {{ here.feelsLike }}°</template>
          </p>
        </div>

        <dl class="flex gap-9">
          <div>
            <dt class="t-note">Humidity</dt>
            <dd class="t-read mt-1.5 text-[1.0625rem]">{{ here.humidity }}%</dd>
          </div>
          <div>
            <dt class="t-note">Wind</dt>
            <dd class="t-read mt-1.5 text-[1.0625rem]">{{ here.windSpeed }}<span class="text-faint"> km/h</span></dd>
          </div>
          <div v-if="away && away.city !== here.city">
            <dt class="t-note">{{ away.city }}</dt>
            <dd class="t-read mt-1.5 text-[1.0625rem]">{{ away.temperature }}°</dd>
          </div>
        </dl>
      </div>

      <p v-else class="t-note">Weather unavailable</p>
    </div>
  </section>
</template>
