export interface Resource {
    url: string
    status: number
    method: string
    // base64 encoded.
    buffer: string
    headers: any
}

export interface Snapshot {
    resources: Resource[],
    page: {
        url: string,
        content: string
    }
}