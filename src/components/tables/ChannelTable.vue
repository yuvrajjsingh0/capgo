<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  kDialog,
  kDialogButton,
  kFab,
} from 'konsta/vue'
import { toast } from 'vue-sonner'
import type { TableColumn } from '../comp_def'
import type { Database } from '~/types/supabase.types'
import { formatDate } from '~/services/date'
import { useSupabase } from '~/services/supabase'
import IconTrash from '~icons/heroicons/trash?raw'
import IconPlus from '~icons/heroicons/plus?width=1em&height=1em'
import { useDisplayStore } from '~/stores/display'
import { useMainStore } from '~/stores/main'
import { appIdToUrl } from '~/services/conversion'

const props = defineProps<{
  appId: string
}>()

const emit = defineEmits<{
  (event: 'misconfigured', misconfigured: boolean): void
}>()

interface Channel {
  version: {
    name: string
    created_at: string
    minUpdateVersion: string | null
  }
  secondVersion: {
    minUpdateVersion: string | null
  }
  misconfigured: boolean | undefined
}
const element: Database['public']['Tables']['channels']['Row'] & Channel = {} as any
const addChannelModal = ref(false)
const columns: Ref<TableColumn[]> = ref<TableColumn[]>([])
const offset = 10
const { t } = useI18n()
const displayStore = useDisplayStore()
const supabase = useSupabase()
const router = useRouter()
const main = useMainStore()
const total = ref(0)
const search = ref('')
const elements = ref<(typeof element)[]>([])
const isLoading = ref(false)
const currentPage = ref(1)
const newChannel = ref<string>()
const versionId = ref<number>()
const filters = ref()
const currentVersionsNumber = computed(() => {
  return (currentPage.value - 1) * offset
})

async function didCancel(name: string) {
  displayStore.dialogOption = {
    header: t('alert-confirm-delete'),
    message: `${t('alert-not-reverse-message')} ${t('alert-delete-message')} ${name}?`,
    buttons: [
      {
        text: t('button-cancel'),
        role: 'cancel',
      },
      {
        text: t('button-delete'),
        id: 'confirm-button',
      },
    ],
  }
  displayStore.showDialog = true
  return displayStore.onDialogDismiss()
}

function findUnknownVersion() {
  return supabase
    .from('app_versions')
    .select('id')
    .eq('app_id', props.appId)
    .eq('name', 'unknown')
    .throwOnError()
    .single()
    .then(({ data }) => data?.id)
}

async function addChannel() {
  if (!newChannel.value || !versionId.value || !main.user)
    return
  try {
    console.log('addChannel', newChannel.value, versionId.value, main.user)
    // { name: channelId, app_id: appId, version: data.id, created_by: userId }
    const { data: dataChannel } = await supabase
      .from('channels')
      .insert([
        {
          name: newChannel.value,
          app_id: props.appId,
          version: versionId.value,
          created_by: main.user.id,
        },
      ])
      .select()
    if (!dataChannel)
      return
    elements.value.push(dataChannel[0] as any)
    newChannel.value = ''
    addChannelModal.value = false
  }
  catch (error) {
    console.error(error)
  }
}

async function getData() {
  isLoading.value = true
  try {
    let req = supabase
      .from('channels')
      .select(`
          id,
          name,
          app_id,
          public,
          version (
            name,
            created_at,
            minUpdateVersion
          ),
          secondVersion (
            minUpdateVersion
          ),
          created_at,
          updated_at,
          disableAutoUpdate,
          enableAbTesting,
          enable_progressive_deploy
          `, { count: 'exact' })
      .eq('app_id', props.appId)
      .range(currentVersionsNumber.value, currentVersionsNumber.value + offset - 1)

    if (search.value)
      req = req.like('name', `%${search.value}%`)

    if (columns.value.length) {
      columns.value.forEach((col) => {
        if (col.sortable && typeof col.sortable === 'string')
          req = req.order(col.key as any, { ascending: col.sortable === 'asc' })
      })
    }
    const { data: dataVersions, count } = await req
    if (!dataVersions)
      return
    elements.value.push(...dataVersions as any)
    // console.log('count', count)
    total.value = count || 0

    // Look for misconfigured channels
    // This will trigger if the channel disables updates based on metadata + if the metadata is undefined
    let anyMisconfigured = false
    const channels = dataVersions
      .filter(e => e.disableAutoUpdate === 'version_number')
      .map(e => e as any as typeof element)

    for (const channel of channels) {
      if (channel.version.minUpdateVersion === null) {
        channel.misconfigured = true
        anyMisconfigured = true
      }

      if ((channel.enable_progressive_deploy || channel.enableAbTesting) && channel.secondVersion.minUpdateVersion === null) {
        channel.misconfigured = true
        anyMisconfigured = true
      }
    }

    // Inform the parent component if there are any misconfigured channels
    emit('misconfigured', anyMisconfigured)
  }
  catch (error) {
    console.error(error)
  }
  isLoading.value = false
}
async function refreshData() {
  // console.log('refreshData')
  try {
    currentPage.value = 1
    elements.value.length = 0
    await getData()
    versionId.value = await findUnknownVersion()
  }
  catch (error) {
    console.error(error)
  }
}
async function deleteOne(one: typeof element) {
  // console.log('deleteBundle', bundle)
  if (await didCancel(t('channel')))
    return
  try {
    const { error: delChanError } = await supabase
      .from('channels')
      .delete()
      .eq('app_id', props.appId)
      .eq('id', one.id)
    if (delChanError) {
      toast.error(t('cannot-delete-channel'))
    }
    else {
      await refreshData()
      toast.success(t('channel-deleted'))
    }
  }
  catch (error) {
    toast.error(t('cannot-delete-channel'))
  }
}

columns.value = [
  {
    label: t('name'),
    key: 'name',
    mobile: 'title',
    sortable: true,
    head: true,
  },
  {
    label: t('last-upload'),
    key: 'updated_at',
    mobile: 'header',
    sortable: 'desc',
    displayFunction: (elem: typeof element) => formatDate(elem.updated_at || ''),
  },
  {
    label: t('last-version'),
    key: 'version',
    mobile: 'footer',
    sortable: true,
    displayFunction: (elem: typeof element) => elem.version.name,
  },
  {
    label: t('misconfigured'),
    key: 'misconfigured',
    mobile: 'footer',
    displayFunction: (elem: typeof element) => elem.misconfigured ? t('yes') : t('no'),
  },
  {
    label: t('action'),
    key: 'action',
    mobile: 'after',
    icon: IconTrash,
    class: 'text-red-500',
    onClick: deleteOne,
  },
]

async function reload() {
  console.log('reload')
  try {
    elements.value.length = 0
    await getData()
  }
  catch (error) {
    console.error(error)
  }
}

async function openOne(one: typeof element) {
  router.push(`/app/p/${appIdToUrl(props.appId)}/channel/${one.id}`)
}
onMounted(async () => {
  await refreshData()
})
watch(props, async () => {
  await refreshData()
})
</script>

<template>
  <div>
    <Table
      v-model:filters="filters" v-model:columns="columns" v-model:current-page="currentPage" v-model:search="search"
      :total="total" row-click :element-list="elements"
      filter-text="Filters"
      :is-loading="isLoading"
      :search-placeholder="t('search-by-name')"
      @reload="reload()" @reset="refreshData()"
      @row-click="openOne"
    />
    <k-fab class="fixed z-20 right-4-safe bottom-20-safe md:right-4-safe md:bottom-4-safe secondary" @click="addChannelModal = true">
      <template #icon>
        <component :is="IconPlus" />
      </template>
    </k-fab>
    <k-dialog
      :opened="addChannelModal"
      @backdropclick="() => (addChannelModal = false)"
    >
      <template #title>
        {{ t('channel-create') }}
      </template>
      <input v-model="newChannel" type="text" placeholder="Production" class="w-full p-1 text-lg text-gray-900 rounded-lg">
      <template #buttons>
        <k-dialog-button class="text-red-800" @click="() => (addChannelModal = false)">
          {{ t('button-cancel') }}
        </k-dialog-button>
        <k-dialog-button @click="addChannel()">
          {{ t('add') }}
        </k-dialog-button>
      </template>
    </k-dialog>
  </div>
</template>
