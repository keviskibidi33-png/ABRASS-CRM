export interface AbrassPayload {
    muestra: string
    numero_ot: string
    fecha_ensayo: string
    realizado_por: string

    masa_muestra_inicial_g?: number | null
    masa_muestra_inicial_seca_despues_lavado_g?: number | null
    masa_muestra_inicial_seca_constante_despues_lavado_g?: number | null
    requiere_lavado?: "SI" | "NO" | "-" | null
    numero_revoluciones?: number | null

    gradacion_a_tamiz_g: Array<number | null>
    gradacion_b_tamiz_g: Array<number | null>
    gradacion_c_tamiz_g: Array<number | null>
    gradacion_d_tamiz_g: Array<number | null>

    item_3_masa_esferas_conjunto_g: Array<number | null>
    item_a_masa_original_g: Array<number | null>
    item_b_masa_final_g: Array<number | null>
    item_c_masa_final_lavada_seca_g: Array<number | null>
    item_d_masa_final_lavada_seca_constante_g: Array<number | null>
    item_e_perdida_abrasion_pct: Array<number | null>
    item_f_perdida_lavado_pct: Array<number | null>

    horno_codigo?: string | null
    maquina_los_angeles_codigo?: string | null
    balanza_1g_codigo?: string | null
    malla_no_12_codigo?: string | null
    malla_no_4_codigo?: string | null

    observaciones?: string | null
    revisado_por?: string | null
    revisado_fecha?: string | null
    aprobado_por?: string | null
    aprobado_fecha?: string | null
}

export interface AbrassEnsayoSummary {
    id: number
    numero_ensayo: string
    numero_ot: string
    cliente?: string | null
    muestra?: string | null
    fecha_documento?: string | null
    estado: string
    perdida_abrasion_promedio_pct?: number | null
    bucket?: string | null
    object_key?: string | null
    fecha_creacion?: string | null
    fecha_actualizacion?: string | null
}

export interface AbrassEnsayoDetail extends AbrassEnsayoSummary {
    payload?: AbrassPayload | null
}

export interface AbrassSaveResponse {
    id: number
    numero_ensayo: string
    numero_ot: string
    estado: string
    perdida_abrasion_promedio_pct?: number | null
    bucket?: string | null
    object_key?: string | null
    fecha_creacion?: string | null
    fecha_actualizacion?: string | null
}
