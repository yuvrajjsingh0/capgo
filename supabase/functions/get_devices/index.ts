import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import { getSDevice } from '../_utils/supabase.ts'
import { methodJson, sendOptionsRes, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders, Order } from '../_utils/types.ts'

interface dataDevice {
  appId: string
  versionId?: string
  deviceIds?: string[]
  search?: string
  order?: Order[]
  rangeStart?: number
  rangeEnd?: number
}

async function main(url: URL, headers: BaseHeaders, method: string, body: dataDevice) {
  try {
    console.log('body', body)
    return sendRes(await getSDevice(headers.authorization || 'MISSING', body.appId, body.versionId, body.deviceIds, body.search, body.order, body.rangeStart, body.rangeEnd, true))
  }
  catch (e) {
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
}

serve(async (event: Request) => {
  if (event.method === 'OPTIONS')
    return sendOptionsRes()
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
