<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { computed, ref, watchEffect } from 'vue'
import { useMainStore } from '~/stores/main'
import Spinner from '~/components/Spinner.vue'
import type { Stat } from '~/components/comp_def'
import { useSupabase } from '~/services/supabase'
import { useDisplayStore } from '~/stores/display'
import Usage from '~/components/dashboard/Usage.vue'
import type { Database } from '~/types/supabase.types'
import { appIdToUrl, urlToAppId } from '~/services/conversion'

const id = ref('')
const { t } = useI18n()
const route = useRoute()
const bundlesNb = ref(0)
const devicesNb = ref(0)
const updatesNb = ref(0)
const channelsNb = ref(0)
const main = useMainStore()
const isLoading = ref(false)
const supabase = useSupabase()
const displayStore = useDisplayStore()
const app = ref<Database['public']['Tables']['apps']['Row']>()

async function loadAppInfo() {
  try {
    const { data: dataApp } = await supabase
      .from('apps')
      .select()
      .eq('app_id', id.value)
      .single()
    app.value = dataApp || app.value
    const promises = []

    const usageByApp = await main.filterDashboard(id.value, main.cycleInfo?.subscription_anchor_start, main.cycleInfo?.subscription_anchor_end)
    updatesNb.value = usageByApp.reduce((acc, cur) => acc + cur.get, 0)
    devicesNb.value = usageByApp.reduce((acc, cur) => acc + cur.mau, 0)

    promises.push(
      supabase
        .from('app_versions')
        .select('*', { count: 'exact', head: true })
        .eq('app_id', id.value)
        .eq('deleted', false)
        .then(({ count: bundlesCount }) => {
          if (bundlesCount)
            bundlesNb.value = bundlesCount
        }),
    )

    promises.push(
      supabase
        .from('channels')
        .select('*', { count: 'exact', head: true })
        .eq('app_id', id.value)
        .then(({ count: channelsCount }) => {
          if (channelsCount)
            channelsNb.value = channelsCount
        }),
    )

    await Promise.all(promises)
  }
  catch (error) {
    console.error(error)
  }
}

async function refreshData() {
  isLoading.value = true
  try {
    await loadAppInfo()
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}
const stats = computed<Stat[]>(() => ([
  {
    label: t('channels'),
    value: channelsNb.value?.toLocaleString(),
    link: `/app/p/${appIdToUrl(id.value)}/channels`,
  },
  {
    label: t('bundles'),
    value: bundlesNb.value?.toLocaleString(),
    link: `/app/p/${appIdToUrl(id.value)}/bundles`,
  },
  {
    label: t('devices'),
    value: devicesNb.value?.toLocaleString(),
    link: `/app/p/${appIdToUrl(id.value)}/devices`,
  },
  {
    label: t('plan-updates'),
    value: updatesNb.value?.toLocaleString(),
    link: `/app/p/${appIdToUrl(id.value)}/logs`,
  },
]))

watchEffect(async () => {
  if (route.path.startsWith('/app/package')) {
    id.value = route.params.package as string
    id.value = urlToAppId(id.value)
    await refreshData()
    displayStore.NavTitle = app.value?.name || ''
    displayStore.defaultBack = '/app/home'
  }
})
</script>

<template>
  <div v-if="isLoading" class="flex flex-col items-center justify-center h-full">
    <Spinner size="w-40 h-40" />
  </div>
  <div v-else class="w-full h-full px-4 pt-4 mb-8 overflow-y-auto max-h-fit lg:px-8 sm:px-6">
    <Usage :app-id="id" />

    <BlurBg class="mb-10">
      <template #default>
        <StatsBar :stats="stats" />
      </template>
    </BlurBg>
  </div>
</template>
