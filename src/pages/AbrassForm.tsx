import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Beaker, Download, Loader2, Trash2 } from 'lucide-react'
import { getAbrassEnsayoDetail, saveAbrassEnsayo, saveAndDownloadAbrassExcel } from '@/services/api'
import type { AbrassPayload } from '@/types'
import AbrasionesMenoresImg from '@/assets/ImagenAbrasionesMenores.png'

const DRAFT_KEY = 'abrass_form_draft_v1'
const DEBOUNCE_MS = 700
const REVISORES = ['-', 'FABIAN LA ROSA'] as const
const APROBADORES = ['-', 'IRMA COAQUIRA'] as const
const TAMIZ_ROWS = [
    { pasante: '1 1/2', retenido: '1' },
    { pasante: '1', retenido: '3/4' },
    { pasante: '3/4', retenido: '1/2' },
    { pasante: '1/2', retenido: '3/8' },
    { pasante: '3/8', retenido: '1/4' },
    { pasante: '1/4', retenido: 'No. 4' },
    { pasante: 'No. 4', retenido: 'No. 8' },
] as const

const ESFERAS_CANTIDAD = ['12', '11', '8', '6'] as const
const ESFERAS_RANGO = ['4975 - 5025', '4555 - 4605', '3310 - 3350', '2485 - 2515'] as const

const EQUIPO_OPTIONS = {
    horno_codigo: ['-', 'EQP-0049'],
    maquina_los_angeles_codigo: ['-', 'EQP-0043'],
    balanza_1g_codigo: ['-', 'EQP-0054'],
    malla_no_12_codigo: ['-', 'INS-0144'],
    malla_no_4_codigo: ['-', 'INS-0053'],
} as const

const withCurrentOption = (value: string | null | undefined, base: readonly string[]) => {
    const current = (value ?? '').trim()
    if (!current || base.includes(current)) return base
    return [...base, current]
}

type TamizFieldKey =
    | 'gradacion_a_tamiz_g'
    | 'gradacion_b_tamiz_g'
    | 'gradacion_c_tamiz_g'
    | 'gradacion_d_tamiz_g'
type QuadFieldKey =
    | 'item_3_masa_esferas_conjunto_g'
    | 'item_a_masa_original_g'
    | 'item_b_masa_final_g'
    | 'item_c_masa_final_lavada_seca_g'
    | 'item_d_masa_final_lavada_seca_constante_g'
    | 'item_e_perdida_abrasion_pct'
    | 'item_f_perdida_lavado_pct'

const ITEM_ROWS: ReadonlyArray<{ item: string; descripcion: string; unidad: string; key: QuadFieldKey }> = [
    { item: '3', descripcion: 'Masa de esferas en conjunto', unidad: 'g', key: 'item_3_masa_esferas_conjunto_g' },
    { item: 'a', descripcion: 'Masa de la muestra de prueba original', unidad: 'g', key: 'item_a_masa_original_g' },
    { item: 'b', descripcion: 'Masa final de la muestra de prueba', unidad: 'g', key: 'item_b_masa_final_g' },
    { item: 'c', descripcion: 'Masa final de la muestra (Lavada seca)', unidad: 'g', key: 'item_c_masa_final_lavada_seca_g' },
    { item: 'd', descripcion: 'Masa final de la muestra (Lavada seca constante)', unidad: 'g', key: 'item_d_masa_final_lavada_seca_constante_g' },
    { item: 'e', descripcion: 'Pérdida por abrasión ((a-d)/a *100)', unidad: '%', key: 'item_e_perdida_abrasion_pct' },
    { item: 'f', descripcion: 'Perdida de masa por lavado ((b-d)/a)*100', unidad: '%', key: 'item_f_perdida_lavado_pct' },
]

const GRADACION_EDITABLE_ROWS: Record<TamizFieldKey, readonly boolean[]> = {
    // Filas por malla (de arriba hacia abajo):
    // 0: 1 1/2-1, 1: 1-3/4, 2: 3/4-1/2, 3: 1/2-3/8, 4: 3/8-1/4, 5: 1/4-No.4, 6: No.4-No.8
    gradacion_a_tamiz_g: [true, true, true, true, false, false, false],
    gradacion_b_tamiz_g: [false, false, true, true, false, false, false],
    gradacion_c_tamiz_g: [false, false, false, false, true, true, false],
    gradacion_d_tamiz_g: [false, false, false, false, false, false, true],
}

const isGradacionEditable = (key: TamizFieldKey, rowIndex: number) => Boolean(GRADACION_EDITABLE_ROWS[key]?.[rowIndex])

const sanitizeGradacionField = (key: TamizFieldKey, values?: Array<number | null>): Array<number | null> =>
    Array.from({ length: TAMIZ_ROWS.length }, (_, idx) => {
        if (!isGradacionEditable(key, idx)) return null
        return values?.[idx] ?? null
    })

const sanitizeGradaciones = (payload: AbrassPayload): AbrassPayload => ({
    ...payload,
    gradacion_a_tamiz_g: sanitizeGradacionField('gradacion_a_tamiz_g', payload.gradacion_a_tamiz_g),
    gradacion_b_tamiz_g: sanitizeGradacionField('gradacion_b_tamiz_g', payload.gradacion_b_tamiz_g),
    gradacion_c_tamiz_g: sanitizeGradacionField('gradacion_c_tamiz_g', payload.gradacion_c_tamiz_g),
    gradacion_d_tamiz_g: sanitizeGradacionField('gradacion_d_tamiz_g', payload.gradacion_d_tamiz_g),
})

const sumGradacionColumn = (key: TamizFieldKey, values: Array<number | null>) =>
    Number(
        values
            .reduce((acc, current, idx) => acc + (isGradacionEditable(key, idx) ? (current ?? 0) : 0), 0)
            .toFixed(4),
    )

const formatComputedNumber = (value: number) => {
    if (Number.isInteger(value)) return String(value)
    return value.toFixed(4).replace(/\.?0+$/, '')
}

const empty4 = () => [null, null, null, null] as Array<number | null>
const empty7 = () => Array.from({ length: 7 }, () => null as number | null)
const parseNum = (v: string) => {
    if (v.trim() === '') return null
    const parsed = Number(v)
    return Number.isFinite(parsed) ? parsed : null
}

const getCurrentYearShort = () => new Date().getFullYear().toString().slice(-2)
const formatTodayShortDate = () => {
    const d = new Date()
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    return `${dd}/${mm}/${yy}`
}

const normalizeMuestraCode = (raw: string): string => {
    const value = raw.trim().toUpperCase()
    if (!value) return ''
    const compact = value.replace(/\s+/g, '')
    const year = getCurrentYearShort()
    const match = compact.match(/^(\d+)(?:-SU)?(?:-(\d{2}))?$/)
    return match ? `${match[1]}-SU-${match[2] || year}` : value
}

const normalizeNumeroOtCode = (raw: string): string => {
    const value = raw.trim().toUpperCase()
    if (!value) return ''
    const compact = value.replace(/\s+/g, '')
    const year = getCurrentYearShort()
    const patterns = [/^(?:N?OT-)?(\d+)(?:-(\d{2}))?$/, /^(\d+)(?:-(?:N?OT))?(?:-(\d{2}))?$/]
    for (const pattern of patterns) {
        const match = compact.match(pattern)
        if (match) return `${match[1]}-${match[2] || year}`
    }
    return value
}

const normalizeFlexibleDate = (raw: string): string => {
    const value = raw.trim()
    if (!value) return ''
    const digits = value.replace(/\D/g, '')
    const year = getCurrentYearShort()
    const pad2 = (part: string) => part.padStart(2, '0').slice(-2)
    const build = (d: string, m: string, y: string = year) => `${pad2(d)}/${pad2(m)}/${pad2(y)}`

    if (value.includes('/')) {
        const [d = '', m = '', yRaw = ''] = value.split('/').map((part) => part.trim())
        if (!d || !m) return value
        let yy = yRaw.replace(/\D/g, '')
        if (yy.length === 4) yy = yy.slice(-2)
        if (yy.length === 1) yy = `0${yy}`
        if (!yy) yy = year
        return build(d, m, yy)
    }

    if (digits.length === 2) return build(digits[0], digits[1])
    if (digits.length === 3) return build(digits[0], digits.slice(1, 3))
    if (digits.length === 4) return build(digits.slice(0, 2), digits.slice(2, 4))
    if (digits.length === 5) return build(digits[0], digits.slice(1, 3), digits.slice(3, 5))
    if (digits.length === 6) return build(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6))
    if (digits.length >= 8) return build(digits.slice(0, 2), digits.slice(2, 4), digits.slice(6, 8))

    return value
}
const getEnsayoId = () => {
    const raw = new URLSearchParams(window.location.search).get('ensayo_id')
    const n = Number(raw)
    return Number.isInteger(n) && n > 0 ? n : null
}

const initialState = (): AbrassPayload => ({
    muestra: '',
    numero_ot: '',
    fecha_ensayo: '',
    realizado_por: '',
    masa_muestra_inicial_g: null,
    masa_muestra_inicial_seca_despues_lavado_g: null,
    masa_muestra_inicial_seca_constante_despues_lavado_g: null,
    requiere_lavado: '-',
    numero_revoluciones: 500,
    gradacion_a_tamiz_g: empty7(),
    gradacion_b_tamiz_g: empty7(),
    gradacion_c_tamiz_g: empty7(),
    gradacion_d_tamiz_g: empty7(),
    item_3_masa_esferas_conjunto_g: empty4(),
    item_a_masa_original_g: empty4(),
    item_b_masa_final_g: empty4(),
    item_c_masa_final_lavada_seca_g: empty4(),
    item_d_masa_final_lavada_seca_constante_g: empty4(),
    item_e_perdida_abrasion_pct: empty4(),
    item_f_perdida_lavado_pct: empty4(),
    horno_codigo: '-',
    maquina_los_angeles_codigo: '-',
    balanza_1g_codigo: '-',
    malla_no_12_codigo: '-',
    malla_no_4_codigo: '-',
    observaciones: '',
    revisado_por: '-',
    revisado_fecha: formatTodayShortDate(),
    aprobado_por: '-',
    aprobado_fecha: formatTodayShortDate(),
})

export default function AbrassForm() {
    const [form, setForm] = useState<AbrassPayload>(() => initialState())
    const [loading, setLoading] = useState(false)
    const [loadingEdit, setLoadingEdit] = useState(false)
    const [ensayoId, setEnsayoId] = useState<number | null>(() => getEnsayoId())

    useEffect(() => {
        const raw = localStorage.getItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
        if (!raw) return
        try {
            setForm(sanitizeGradaciones({ ...initialState(), ...JSON.parse(raw) }))
        } catch {
            // ignore draft corruption
        }
    }, [ensayoId])

    useEffect(() => {
        const t = window.setTimeout(() => {
            localStorage.setItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`, JSON.stringify(form))
        }, DEBOUNCE_MS)
        return () => window.clearTimeout(t)
    }, [form, ensayoId])

    useEffect(() => {
        if (!ensayoId) return
        let cancel = false
        const run = async () => {
            setLoadingEdit(true)
            try {
                const detail = await getAbrassEnsayoDetail(ensayoId)
                if (!cancel && detail.payload) setForm(sanitizeGradaciones({ ...initialState(), ...detail.payload }))
            } catch {
                toast.error('No se pudo cargar ensayo ABRASS.')
            } finally {
                if (!cancel) setLoadingEdit(false)
            }
        }
        void run()
        return () => {
            cancel = true
        }
    }, [ensayoId])

    const gradacionTotals = useMemo(
        () => ({
            a: sumGradacionColumn('gradacion_a_tamiz_g', form.gradacion_a_tamiz_g),
            b: sumGradacionColumn('gradacion_b_tamiz_g', form.gradacion_b_tamiz_g),
            c: sumGradacionColumn('gradacion_c_tamiz_g', form.gradacion_c_tamiz_g),
            d: sumGradacionColumn('gradacion_d_tamiz_g', form.gradacion_d_tamiz_g),
        }),
        [form.gradacion_a_tamiz_g, form.gradacion_b_tamiz_g, form.gradacion_c_tamiz_g, form.gradacion_d_tamiz_g],
    )
    const itemAMasaOriginalComputed = useMemo(
        () => [gradacionTotals.a, gradacionTotals.b, gradacionTotals.c, gradacionTotals.d] as const,
        [gradacionTotals.a, gradacionTotals.b, gradacionTotals.c, gradacionTotals.d],
    )

    useEffect(() => {
        setForm((prev) => {
            const nextE = [...prev.item_e_perdida_abrasion_pct]
            const nextF = [...prev.item_f_perdida_lavado_pct]
            let changed = false

            for (let i = 0; i < 4; i++) {
                const a = itemAMasaOriginalComputed[i]
                const b = prev.item_b_masa_final_g[i]
                const d = prev.item_d_masa_final_lavada_seca_constante_g[i]

                if (a && a > 0) {
                    if (d != null) {
                        const valE = Number(((a - d) / a * 100).toFixed(4))
                        if (nextE[i] !== valE) {
                            nextE[i] = valE
                            changed = true
                        }
                    } else if (nextE[i] !== null) {
                        nextE[i] = null
                        changed = true
                    }

                    if (b != null && d != null) {
                        const valF = Number(((b - d) / a * 100).toFixed(4))
                        if (nextF[i] !== valF) {
                            nextF[i] = valF
                            changed = true
                        }
                    } else if (nextF[i] !== null) {
                        nextF[i] = null
                        changed = true
                    }
                } else {
                    if (nextE[i] !== null || nextF[i] !== null) {
                        nextE[i] = null
                        nextF[i] = null
                        changed = true
                    }
                }
            }

            if (changed) {
                return {
                    ...prev,
                    item_e_perdida_abrasion_pct: nextE,
                    item_f_perdida_lavado_pct: nextF,
                }
            }
            return prev
        })
    }, [itemAMasaOriginalComputed, form.item_b_masa_final_g, form.item_d_masa_final_lavada_seca_constante_g])

    const perdidaAbrasionPromedio = useMemo(() => {
        const vals = form.item_e_perdida_abrasion_pct.filter((v): v is number => v != null)
        return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4)) : null
    }, [form.item_e_perdida_abrasion_pct])

    const setField = useCallback(<K extends keyof AbrassPayload>(k: K, v: AbrassPayload[K]) => {
        setForm((p) => ({ ...p, [k]: v }))
    }, [])

    const setArray = useCallback((k: TamizFieldKey, i: number, raw: string) => {
        if (!isGradacionEditable(k, i)) return
        setForm((p) => {
            const next = [...p[k]]
            next[i] = parseNum(raw)
            return { ...p, [k]: next }
        })
    }, [])

    const setQuad = useCallback((k: QuadFieldKey, i: number, raw: string) => {
        setForm((p) => {
            const next = [...p[k]]
            next[i] = parseNum(raw)
            return { ...p, [k]: next }
        })
    }, [])

    const clearAll = useCallback(() => {
        if (!window.confirm('Se limpiarán los datos no guardados. ¿Deseas continuar?')) return
        localStorage.removeItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
        setForm(initialState())
    }, [ensayoId])

    const save = useCallback(async (download: boolean) => {
        if (!form.muestra || !form.numero_ot || !form.realizado_por) return toast.error('Complete Muestra, N OT y Realizado por.')
        const payload = sanitizeGradaciones({
            ...form,
            item_a_masa_original_g: [
                sumGradacionColumn('gradacion_a_tamiz_g', form.gradacion_a_tamiz_g),
                sumGradacionColumn('gradacion_b_tamiz_g', form.gradacion_b_tamiz_g),
                sumGradacionColumn('gradacion_c_tamiz_g', form.gradacion_c_tamiz_g),
                sumGradacionColumn('gradacion_d_tamiz_g', form.gradacion_d_tamiz_g),
            ],
            numero_revoluciones: 500,
        })
        setLoading(true)
        try {
            if (download) {
                const { blob } = await saveAndDownloadAbrassExcel(payload, ensayoId ?? undefined)
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `ABRASS_${form.numero_ot}_${new Date().toISOString().slice(0, 10)}.xlsx`
                a.click()
                URL.revokeObjectURL(url)
            } else {
                await saveAbrassEnsayo(payload, ensayoId ?? undefined)
            }
            localStorage.removeItem(`${DRAFT_KEY}:${ensayoId ?? 'new'}`)
            setForm(initialState())
            setEnsayoId(null)
            if (window.parent !== window) window.parent.postMessage({ type: 'CLOSE_MODAL' }, '*')
            toast.success(download ? 'ABRASS guardado y descargado.' : 'ABRASS guardado.')
        } catch (err) {
            const msg = axios.isAxiosError(err) ? err.response?.data?.detail || 'No se pudo generar ABRASS.' : 'No se pudo generar ABRASS.'
            toast.error(msg)
        } finally {
            setLoading(false)
        }
    }, [ensayoId, form])


    const requiresSI = form.requiere_lavado === 'SI'
    const requiresNO = form.requiere_lavado === 'NO'
    const denseInputClass =
        'h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/35'

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-6">
            <div className="mx-auto max-w-[1280px] space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-slate-50">
                        <Beaker className="h-5 w-5 text-slate-900" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-slate-900 md:text-lg">ABRASS - ASTM C131/C131M-20</h1>
                        <p className="text-xs text-slate-600">Réplica del formato Excel oficial</p>
                    </div>
                </div>
                {loadingEdit ? (
                    <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando ensayo...
                    </div>
                ) : null}
                <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
                    <div className="border-b border-slate-300 bg-slate-50 px-4 py-4 text-center">
                        <p className="text-[28px] font-semibold leading-tight text-slate-900">LABORATORIO DE ENSAYO DE MATERIALES</p>
                        <p className="text-xl font-semibold leading-tight text-slate-900">FORMATO N° F-LEM-P-AG-36.01</p>
                    </div>
                    <div className="border-b border-slate-300 bg-white px-3 py-3">
                        <table className="w-full table-fixed border border-slate-300 text-sm">
                            <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                <tr>
                                    <th className="border-r border-slate-300 py-1">MUESTRA</th>
                                    <th className="border-r border-slate-300 py-1">N° OT</th>
                                    <th className="border-r border-slate-300 py-1">FECHA DE ENSAYO</th>
                                    <th className="py-1">REALIZADO</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border-r border-t border-slate-300 p-1">
                                        <input
                                            className={denseInputClass}
                                            value={form.muestra}
                                            onChange={(e) => setField('muestra', e.target.value)}
                                            onBlur={() => setField('muestra', normalizeMuestraCode(form.muestra))}
                                            autoComplete="off"
                                            data-lpignore="true"
                                        />
                                    </td>
                                    <td className="border-r border-t border-slate-300 p-1">
                                        <input
                                            className={denseInputClass}
                                            value={form.numero_ot}
                                            onChange={(e) => setField('numero_ot', e.target.value)}
                                            onBlur={() => setField('numero_ot', normalizeNumeroOtCode(form.numero_ot))}
                                            autoComplete="off"
                                            data-lpignore="true"
                                        />
                                    </td>
                                    <td className="border-r border-t border-slate-300 p-1">
                                        <input
                                            className={denseInputClass}
                                            value={form.fecha_ensayo}
                                            onChange={(e) => setField('fecha_ensayo', e.target.value)}
                                            onBlur={() => setField('fecha_ensayo', normalizeFlexibleDate(form.fecha_ensayo))}
                                            autoComplete="off"
                                            data-lpignore="true"
                                            placeholder="DD/MM/AA"
                                        />
                                    </td>
                                    <td className="border-t border-slate-300 p-1">
                                        <input
                                            className={denseInputClass}
                                            value={form.realizado_por}
                                            onChange={(e) => setField('realizado_por', e.target.value)}
                                            autoComplete="off"
                                            data-lpignore="true"
                                        />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div className="border-b border-slate-300 bg-slate-100 px-4 py-3 text-center">
                        <p className="text-[27px] font-semibold leading-tight text-slate-900">
                            STANDARD TEST METHOD FOR RESISTANCE TO DEGRADATION OF SMALL-SIZE COARSE AGGREGATE
                        </p>
                        <p className="text-[27px] font-semibold leading-tight text-slate-900">
                            AGGREGATE BY ABRASION AND IMPACT IN THE LOS ANGELES MACHINE
                        </p>
                        <p className="text-[27px] font-semibold text-slate-900">ASTM C131/C131M-20</p>
                    </div>
                    <div className="space-y-3 p-3">
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_420px]">
                            <div className="overflow-hidden rounded-lg border border-slate-300">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                        <tr>
                                            <th className="border-b border-r border-slate-300 px-2 py-1 text-left">MUESTRA DE PRUEBA ANTES DEL FRACCIONAMIENTO</th>
                                            <th className="w-12 border-b border-r border-slate-300 py-1">UND</th>
                                            <th className="w-52 border-b border-slate-300 py-1">DATO</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="border-b border-r border-slate-300 px-2 py-1">Masa muestra inicial</td>
                                            <td className="border-b border-r border-slate-300 text-center">g</td>
                                            <td className="border-b border-slate-300 p-1">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    className={`${denseInputClass} text-center`}
                                                    value={form.masa_muestra_inicial_g ?? ''}
                                                    onChange={(e) => setField('masa_muestra_inicial_g', parseNum(e.target.value))}
                                                />
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-r border-slate-300 px-2 py-1">Masa muestra inicial seca despues del lavado</td>
                                            <td className="border-b border-r border-slate-300 text-center">g</td>
                                            <td className="border-b border-slate-300 p-1">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    className={`${denseInputClass} text-center`}
                                                    value={form.masa_muestra_inicial_seca_despues_lavado_g ?? ''}
                                                    onChange={(e) => setField('masa_muestra_inicial_seca_despues_lavado_g', parseNum(e.target.value))}
                                                />
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-r border-slate-300 px-2 py-1">Masa muestra inicial seca constante despues del lavado</td>
                                            <td className="border-r border-slate-300 text-center">g</td>
                                            <td className="p-1">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    className={`${denseInputClass} text-center`}
                                                    value={form.masa_muestra_inicial_seca_constante_despues_lavado_g ?? ''}
                                                    onChange={(e) => setField('masa_muestra_inicial_seca_constante_despues_lavado_g', parseNum(e.target.value))}
                                                />
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="overflow-hidden rounded-lg border border-slate-300">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                        <tr>
                                            <th className="border-b border-r border-slate-300 px-2 py-1 text-left">
                                                Se requiere lavado despues de la prueba (colocado en maquina angeles)
                                            </th>
                                            <th className="w-[70px] border-b border-r border-slate-300 px-1 py-1 text-center">SI</th>
                                            <th className="w-[70px] border-b border-slate-300 px-1 py-1 text-center">NO</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="border-b border-r border-slate-300 px-2 py-1">Selección</td>
                                            <td className="border-b border-slate-300 px-1 py-1 text-center" colSpan={2}>
                                                <select
                                                    className={denseInputClass}
                                                    value={form.requiere_lavado}
                                                    onChange={(e) => setField('requiere_lavado', e.target.value)}
                                                >
                                                    <option value="-">-</option>
                                                    <option value="SI">SI</option>
                                                    <option value="NO">NO</option>
                                                </select>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-r border-slate-300 px-2 py-1">N° revoluciones</td>
                                            <td className="border-b border-slate-300 p-1" colSpan={2}>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    className={`${denseInputClass} cursor-not-allowed bg-slate-100 text-center font-bold`}
                                                    value={500}
                                                    readOnly
                                                />
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="overflow-hidden rounded-lg border border-slate-300">
                            <table className="w-full table-fixed text-sm">
                                <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                    <tr>
                                        <th className="border-b border-r border-slate-300 py-1" colSpan={2}>TAMIZ (in)</th>
                                        <th className="border-b border-slate-300 py-1" colSpan={4}>GRADACIONES (Masa en cada tamiz, g)</th>
                                    </tr>
                                    <tr>
                                        <th className="w-24 border-r border-slate-300 px-2 py-1">Pasante</th>
                                        <th className="w-24 border-r border-slate-300 px-2 py-1">Retenido</th>
                                        <th className="w-32 border-r border-slate-300 px-2 py-1">Gradación A</th>
                                        <th className="w-32 border-r border-slate-300 px-2 py-1">Gradación B</th>
                                        <th className="w-32 border-r border-slate-300 px-2 py-1">Gradación C</th>
                                        <th className="w-32 px-2 py-1">Gradación D</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {TAMIZ_ROWS.map((row, i) => (
                                        <tr key={`${row.pasante}-${row.retenido}`}>
                                            <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{row.pasante}</td>
                                            <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{row.retenido}</td>
                                            <td className={`border-t border-r border-slate-300 p-1 ${isGradacionEditable('gradacion_a_tamiz_g', i) ? 'bg-slate-200/80' : 'bg-slate-50'}`}>
                                                <input
                                                    type={isGradacionEditable('gradacion_a_tamiz_g', i) ? 'number' : 'text'}
                                                    step="any"
                                                    className={`${denseInputClass} ${isGradacionEditable('gradacion_a_tamiz_g', i) ? 'border-slate-400 bg-slate-200 font-medium' : 'cursor-not-allowed bg-slate-100 text-center text-slate-500'}`}
                                                    value={isGradacionEditable('gradacion_a_tamiz_g', i) ? (form.gradacion_a_tamiz_g[i] ?? '') : '-'}
                                                    onChange={(e) => setArray('gradacion_a_tamiz_g', i, e.target.value)}
                                                    readOnly={!isGradacionEditable('gradacion_a_tamiz_g', i)}
                                                    tabIndex={isGradacionEditable('gradacion_a_tamiz_g', i) ? 0 : -1}
                                                />
                                            </td>
                                            <td className={`border-t border-r border-slate-300 p-1 ${isGradacionEditable('gradacion_b_tamiz_g', i) ? 'bg-slate-200/80' : 'bg-slate-50'}`}>
                                                <input
                                                    type={isGradacionEditable('gradacion_b_tamiz_g', i) ? 'number' : 'text'}
                                                    step="any"
                                                    className={`${denseInputClass} ${isGradacionEditable('gradacion_b_tamiz_g', i) ? 'border-slate-400 bg-slate-200 font-medium' : 'cursor-not-allowed bg-slate-100 text-center text-slate-500'}`}
                                                    value={isGradacionEditable('gradacion_b_tamiz_g', i) ? (form.gradacion_b_tamiz_g[i] ?? '') : '-'}
                                                    onChange={(e) => setArray('gradacion_b_tamiz_g', i, e.target.value)}
                                                    readOnly={!isGradacionEditable('gradacion_b_tamiz_g', i)}
                                                    tabIndex={isGradacionEditable('gradacion_b_tamiz_g', i) ? 0 : -1}
                                                />
                                            </td>
                                            <td className={`border-t border-r border-slate-300 p-1 ${isGradacionEditable('gradacion_c_tamiz_g', i) ? 'bg-slate-200/80' : 'bg-slate-50'}`}>
                                                <input
                                                    type={isGradacionEditable('gradacion_c_tamiz_g', i) ? 'number' : 'text'}
                                                    step="any"
                                                    className={`${denseInputClass} ${isGradacionEditable('gradacion_c_tamiz_g', i) ? 'border-slate-400 bg-slate-200 font-medium' : 'cursor-not-allowed bg-slate-100 text-center text-slate-500'}`}
                                                    value={isGradacionEditable('gradacion_c_tamiz_g', i) ? (form.gradacion_c_tamiz_g[i] ?? '') : '-'}
                                                    onChange={(e) => setArray('gradacion_c_tamiz_g', i, e.target.value)}
                                                    readOnly={!isGradacionEditable('gradacion_c_tamiz_g', i)}
                                                    tabIndex={isGradacionEditable('gradacion_c_tamiz_g', i) ? 0 : -1}
                                                />
                                            </td>
                                            <td className={`border-t border-slate-300 p-1 ${isGradacionEditable('gradacion_d_tamiz_g', i) ? 'bg-slate-200/80' : 'bg-slate-50'}`}>
                                                <input
                                                    type={isGradacionEditable('gradacion_d_tamiz_g', i) ? 'number' : 'text'}
                                                    step="any"
                                                    className={`${denseInputClass} ${isGradacionEditable('gradacion_d_tamiz_g', i) ? 'border-slate-400 bg-slate-200 font-medium' : 'cursor-not-allowed bg-slate-100 text-center text-slate-500'}`}
                                                    value={isGradacionEditable('gradacion_d_tamiz_g', i) ? (form.gradacion_d_tamiz_g[i] ?? '') : '-'}
                                                    onChange={(e) => setArray('gradacion_d_tamiz_g', i, e.target.value)}
                                                    readOnly={!isGradacionEditable('gradacion_d_tamiz_g', i)}
                                                    tabIndex={isGradacionEditable('gradacion_d_tamiz_g', i) ? 0 : -1}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-slate-50 font-semibold text-slate-900">
                                        <td className="border-t border-r border-slate-300 px-2 py-1 text-center" colSpan={2}>TOTAL</td>
                                        <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{formatComputedNumber(gradacionTotals.a)}</td>
                                        <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{formatComputedNumber(gradacionTotals.b)}</td>
                                        <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{formatComputedNumber(gradacionTotals.c)}</td>
                                        <td className="border-t border-slate-300 px-2 py-1 text-center">{formatComputedNumber(gradacionTotals.d)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
                            <div className="border-b border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800">
                                Referencia visual (Abrasion menores)
                            </div>
                            <div className="p-3">
                                <img
                                    src={AbrasionesMenoresImg}
                                    alt="Referencia de abrasiones menores - tabla de gradación"
                                    className="w-full max-h-[420px] rounded-md border border-slate-200 object-contain bg-white"
                                    loading="lazy"
                                    decoding="async"
                                />
                                <p className="mt-2 text-[11px] text-slate-600">
                                    Tabla guía para gradaciones y masa de muestra (formato Excel oficial).
                                </p>
                            </div>
                        </div>
                        <div className="overflow-hidden rounded-lg border border-slate-300">
                            <table className="w-full table-fixed text-sm">
                                <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                    <tr>
                                        <th className="w-10 border-b border-r border-slate-300 py-1">ITEM</th>
                                        <th className="border-b border-r border-slate-300 py-1">DESCRIPCIÓN</th>
                                        <th className="w-12 border-b border-r border-slate-300 py-1">UND</th>
                                        <th className="w-28 border-b border-r border-slate-300 py-1">Gradación A</th>
                                        <th className="w-28 border-b border-r border-slate-300 py-1">Gradación B</th>
                                        <th className="w-28 border-b border-r border-slate-300 py-1">Gradación C</th>
                                        <th className="w-28 border-b border-slate-300 py-1">Gradación D</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="border-t border-r border-slate-300 px-2 py-1 text-center">1</td>
                                        <td className="border-t border-r border-slate-300 px-2 py-1">Numero de esferas</td>
                                        <td className="border-t border-r border-slate-300 px-2 py-1 text-center">-</td>
                                        {ESFERAS_CANTIDAD.map((value, idx) => (
                                            <td key={`esferas-cant-${idx}`} className={`border-t ${idx < 3 ? 'border-r' : ''} border-slate-300 px-2 py-1 text-center`}>
                                                {value}
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="border-t border-r border-slate-300 px-2 py-1 text-center">2</td>
                                        <td className="border-t border-r border-slate-300 px-2 py-1">Masa requerida de las esferas</td>
                                        <td className="border-t border-r border-slate-300 px-2 py-1 text-center">g</td>
                                        {ESFERAS_RANGO.map((value, idx) => (
                                            <td key={`esferas-rango-${idx}`} className={`border-t ${idx < 3 ? 'border-r' : ''} border-slate-300 px-2 py-1 text-center`}>
                                                {value}
                                            </td>
                                        ))}
                                    </tr>
                                    {ITEM_ROWS.map((row) => (
                                        <tr key={`${row.item}-${row.key}`}>
                                            <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{row.item}</td>
                                            <td className="border-t border-r border-slate-300 px-2 py-1">{row.descripcion}</td>
                                            <td className="border-t border-r border-slate-300 px-2 py-1 text-center">{row.unidad}</td>
                                            {[0, 1, 2, 3].map((idx) => (
                                                <td key={`${row.key}-${idx}`} className={`border-t ${idx < 3 ? 'border-r' : ''} border-slate-300 p-1`}>
                                                    {row.key === 'item_a_masa_original_g' || row.key === 'item_e_perdida_abrasion_pct' || row.key === 'item_f_perdida_lavado_pct' ? (
                                                        <input
                                                            type="text"
                                                            className={`${denseInputClass} cursor-not-allowed bg-slate-100 text-center font-medium text-slate-700`}
                                                            value={form[row.key][idx] != null ? formatComputedNumber(form[row.key][idx] as number) : (row.key === 'item_a_masa_original_g' ? formatComputedNumber(itemAMasaOriginalComputed[idx]) : '-')}
                                                            readOnly
                                                            tabIndex={-1}
                                                        />
                                                    ) : (
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            className={`${denseInputClass} text-center`}
                                                            value={form[row.key][idx] ?? ''}
                                                            onChange={(e) => setQuad(row.key, idx, e.target.value)}
                                                        />
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="border-t border-slate-300 px-3 py-2 text-xs text-slate-700">
                                (*) la perdida por lavado no superara en mas del 0.2% de la muestra original
                            </div>
                        </div>
                        <div className="overflow-hidden rounded-lg border border-slate-300">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 text-xs font-semibold text-slate-800">
                                    <tr>
                                        <th className="border-b border-r border-slate-300 py-1">Equipo</th>
                                        <th className="w-44 border-b border-r border-slate-300 py-1">Código</th>
                                        <th className="border-b border-r border-slate-300 py-1">Equipo</th>
                                        <th className="w-44 border-b border-slate-300 py-1">Código</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="border-t border-r border-slate-300 px-2 py-1">Horno</td>
                                        <td className="border-t border-r border-slate-300 p-1">
                                            <select className={denseInputClass} value={form.horno_codigo ?? '-'} onChange={(e) => setField('horno_codigo', e.target.value)}>
                                                {withCurrentOption(form.horno_codigo, EQUIPO_OPTIONS.horno_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </td>
                                        <td className="border-t border-r border-slate-300 px-2 py-1">Malla No. 12</td>
                                        <td className="border-t border-slate-300 p-1">
                                            <select className={denseInputClass} value={form.malla_no_12_codigo ?? '-'} onChange={(e) => setField('malla_no_12_codigo', e.target.value)}>
                                                {withCurrentOption(form.malla_no_12_codigo, EQUIPO_OPTIONS.malla_no_12_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="border-t border-r border-slate-300 px-2 py-1">Máquina Los Ángeles</td>
                                        <td className="border-t border-r border-slate-300 p-1">
                                            <select className={denseInputClass} value={form.maquina_los_angeles_codigo ?? '-'} onChange={(e) => setField('maquina_los_angeles_codigo', e.target.value)}>
                                                {withCurrentOption(form.maquina_los_angeles_codigo, EQUIPO_OPTIONS.maquina_los_angeles_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </td>
                                        <td className="border-t border-r border-slate-300 px-2 py-1">Malla No. 4</td>
                                        <td className="border-t border-slate-300 p-1">
                                            <select className={denseInputClass} value={form.malla_no_4_codigo ?? '-'} onChange={(e) => setField('malla_no_4_codigo', e.target.value)}>
                                                {withCurrentOption(form.malla_no_4_codigo, EQUIPO_OPTIONS.malla_no_4_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="border-t border-r border-slate-300 px-2 py-1">Balanza 1g</td>
                                        <td className="border-t border-r border-slate-300 p-1">
                                            <select className={denseInputClass} value={form.balanza_1g_codigo ?? '-'} onChange={(e) => setField('balanza_1g_codigo', e.target.value)}>
                                                {withCurrentOption(form.balanza_1g_codigo, EQUIPO_OPTIONS.balanza_1g_codigo).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </td>
                                        <td className="border-t border-r border-slate-300 px-2 py-1"></td>
                                        <td className="border-t border-slate-300 p-1"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_280px_280px]">
                            <div className="overflow-hidden rounded-lg border border-slate-300">
                                <div className="border-b border-slate-300 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800">Nota:</div>
                                <div className="p-2">
                                    <textarea
                                        className="w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/35"
                                        rows={4}
                                        value={form.observaciones ?? ''}
                                        onChange={(e) => setField('observaciones', e.target.value)}
                                        autoComplete="off"
                                        data-lpignore="true"
                                    />
                                    <p className="mt-2 text-xs font-semibold text-slate-700">Pérdida abrasión promedio (%): {perdidaAbrasionPromedio ?? '-'}</p>
                                </div>
                            </div>
                            <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
                                <div className="border-b border-slate-300 px-2 py-1 text-sm font-semibold">Revisado:</div>
                                <div className="space-y-2 p-2">
                                    <select className={denseInputClass} value={form.revisado_por ?? '-'} onChange={(e) => setField('revisado_por', e.target.value)}>
                                        {REVISORES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                    <input
                                        className={denseInputClass}
                                        value={form.revisado_fecha ?? ''}
                                        onChange={(e) => setField('revisado_fecha', e.target.value)}
                                        onBlur={() => setField('revisado_fecha', normalizeFlexibleDate(form.revisado_fecha ?? ''))}
                                        autoComplete="off"
                                        data-lpignore="true"
                                        placeholder="Fecha"
                                    />
                                </div>
                            </div>
                            <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
                                <div className="border-b border-slate-300 px-2 py-1 text-sm font-semibold">Aprobado:</div>
                                <div className="space-y-2 p-2">
                                    <select className={denseInputClass} value={form.aprobado_por ?? '-'} onChange={(e) => setField('aprobado_por', e.target.value)}>
                                        {APROBADORES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                    <input
                                        className={denseInputClass}
                                        value={form.aprobado_fecha ?? ''}
                                        onChange={(e) => setField('aprobado_fecha', e.target.value)}
                                        onBlur={() => setField('aprobado_fecha', normalizeFlexibleDate(form.aprobado_fecha ?? ''))}
                                        autoComplete="off"
                                        data-lpignore="true"
                                        placeholder="Fecha"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="border-t-2 border-blue-900 px-3 py-2 text-center text-[11px] leading-tight text-slate-700">
                            <p>WEB: www.geofal.com.pe  E-MAIL: laboratorio@geofal.com.pe / geofal.sac@gmail.com</p>
                            <p>Av. Marañón 763, Los Olivos-Lima | Teléfono 01522-1851</p>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <button
                        onClick={clearAll}
                        disabled={loading}
                        className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                    >
                        <Trash2 className="h-4 w-4" />
                        Limpiar todo
                    </button>
                    <button
                        onClick={() => void save(false)}
                        disabled={loading}
                        className="h-11 rounded-lg border border-slate-900 bg-white font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                    >
                        {loading ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                        onClick={() => void save(true)}
                        disabled={loading}
                        className="flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Procesando...
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4" />
                                Guardar y Descargar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
