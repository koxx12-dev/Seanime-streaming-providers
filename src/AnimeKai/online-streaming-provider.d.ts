// online-streaming-provider.d.ts

declare type SearchResult = {
    id: string // Passed to findEpisode
    title: string
    url: string
    subOrDub: SubOrDub
}
 
declare type SubOrDub = "sub" | "dub" | "both"
 
// Passed to findEpisodeServer
declare type EpisodeDetails = {
    id: string
    // 1, 2, 3, etc.
    number: number
    url: string
    title?: string
}
 
// Server that hosts the video.
declare type EpisodeServer = {
    server: string
    headers: { [key: string]: string }
    videoSources: VideoSource[]
}
 
declare type VideoSourceType = "mp4" | "m3u8"
 
declare type VideoSource = {
    url: string
    type: VideoSourceType
    quality: string
    subtitles: VideoSubtitle[]
}
 
declare type VideoSubtitle = {
    id: string
    url: string
    language: string
    isDefault: boolean
}
 
declare type Settings = {
    episodeServers: string[]
    supportsDub: boolean
}

declare type SearchOptions = {
    query: string
    dub: boolean
    year?: number
}