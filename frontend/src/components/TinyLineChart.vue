<script setup>
import {computed} from 'vue';
import {Line} from 'vue-chartjs';
import {CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip,} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const props = defineProps({
  datasets: {
    type: Array,
    default: () => [],
  },
  yMax: {
    type: Number,
    default: null,
  },
});

const chartData = computed(() => {
  const longest = props.datasets.reduce((acc, item) => Math.max(acc, item?.data?.length || 0), 0);
  const labels = Array.from({length: longest}, (_, index) => index + 1);

  return {
    labels,
    datasets: props.datasets.map((item) => ({
      label: item.label || '',
      data: item.data || [],
      borderColor: item.borderColor || '#60a5fa',
      backgroundColor: item.backgroundColor || 'rgba(96, 165, 250, 0.16)',
      borderWidth: item.borderWidth || 2,
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0.35,
      fill: item.fill ?? true,
    })),
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 220,
    easing: 'easeOutQuart',
  },
  plugins: {
    legend: {display: false},
    tooltip: {enabled: false},
  },
  scales: {
    x: {
      display: false,
      grid: {display: false},
      border: {display: false},
    },
    y: {
      display: false,
      grid: {display: false},
      border: {display: false},
      beginAtZero: true,
      suggestedMax: props.yMax ?? undefined,
      max: props.yMax ?? undefined,
    },
  },
  elements: {
    line: {capBezierPoints: true},
  },
}));
</script>

<template>
  <div class="chart-wrap">
    <Line :data="chartData" :options="chartOptions"/>
  </div>
</template>

<style scoped>
.chart-wrap {
  margin-top: 0.45rem;
  height: 3rem;
}
</style>

