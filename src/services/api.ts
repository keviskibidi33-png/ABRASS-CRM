import axios from 'axios'
import type {
    AbrassPayload,
    AbrassSaveResponse,
    AbrassEnsayoDetail,
    AbrassEnsayoSummary,
} from '@/types'

const API_URL = import.meta.env.VITE_API_URL || 'https://api.geofal.com.pe'

const api = axios.create({
    baseURL: API_URL,
})

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            window.dispatchEvent(new CustomEvent('session-expired'))
        }
        return Promise.reject(error)
    },
)

export async function saveAbrassEnsayo(
    payload: AbrassPayload,
    ensayoId?: number,
): Promise<AbrassSaveResponse> {
    const { data } = await api.post<AbrassSaveResponse>('/api/abrass/excel', payload, {
        params: {
            download: false,
            ensayo_id: ensayoId,
        },
    })
    return data
}

export async function saveAndDownloadAbrassExcel(
    payload: AbrassPayload,
    ensayoId?: number,
): Promise<{ blob: Blob; ensayoId?: number }> {
    const response = await api.post('/api/abrass/excel', payload, {
        params: {
            download: true,
            ensayo_id: ensayoId,
        },
        responseType: 'blob',
    })

    const ensayoIdHeader = response.headers['x-abrass-id']
    const parsedId = Number(ensayoIdHeader)
    return {
        blob: response.data,
        ensayoId: Number.isFinite(parsedId) ? parsedId : undefined,
    }
}

export async function listAbrassEnsayos(limit = 100): Promise<AbrassEnsayoSummary[]> {
    const { data } = await api.get<AbrassEnsayoSummary[]>('/api/abrass/', {
        params: { limit },
    })
    return data
}

export async function getAbrassEnsayoDetail(ensayoId: number): Promise<AbrassEnsayoDetail> {
    const { data } = await api.get<AbrassEnsayoDetail>(`/api/abrass/${ensayoId}`)
    return data
}

export default api
