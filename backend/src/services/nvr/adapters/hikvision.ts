import { INvrAdapter, NvrCredentials, NvrConnectionTestResult, DiscoveredChannel, RecordingSegment, PlaybackSession, NvrUnsupportedError } from '../types.js';
import { createNvrHttpClient, rtspBase } from '../http.js';
import { verifyRtspVideo } from '../rtspProbe.js';
import { randomUUID } from 'node:crypto';

/**
 * Hikvision adapter — uses ISAPI (HTTP Digest auth).
 * Docs: https://www.hikvision.com/en/mkt/support/docCenterDetail/5c67f1e2-38db-4b56-9f0a-8b6d8f6b1f9e
 *
 * - Device info: GET /ISAPI/System/deviceInfo
 * - Channel discovery: GET /ISAPI/ContentMgmt/InputProxy/channels (or /ISAPI/Streaming/channels)
 * - Live RTSP: rtsp://host:554/Streaming/Channels/{channel*100+1} (main) / {channel*100+2} (sub)
 * - Playback: ISAPI /ISAPI/ContentMgmt/search and RTSP /Streaming/tracks/{trackID}.
 */
export class HikvisionAdapter implements INvrAdapter {
  readonly brand = 'hikvision' as const;
  readonly supportsDiscovery = true;
  readonly supportsPlayback = true;

  async testConnection(creds: NvrCredentials): Promise<NvrConnectionTestResult> {
    const client = createNvrHttpClient(creds);
    let response;
    try {
      response = await client.get('/ISAPI/System/deviceInfo');
    } catch {
      return {
        ok: false,
        status: 'connection_error',
        message: 'Could not reach the NVR HTTP service. Check the IP, HTTP port, and backend network access.',
      };
    }

    if (response.status === 401) {
      return { ok: false, status: 'authentication_failed', message: 'HTTP authentication failed. Check the NVR username and password.' };
    }
    if (response.status !== 200 || !response.data) {
      return {
        ok: false,
        status: 'connection_error',
        message: `Hikvision device info request failed (HTTP ${response.status}).`,
      };
    }

    const rawInfo = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (!/<(?:\w+:)?DeviceInfo\b/i.test(rawInfo)) {
      return {
        ok: false,
        status: 'connection_error',
        message: 'The HTTP service responded, but did not return the expected Hikvision device-info document.',
      };
    }
    const deviceInfo = {
      model: readXmlValue(rawInfo, 'model') ?? readXmlValue(rawInfo, 'deviceName'),
      firmware: readXmlValue(rawInfo, 'firmwareVersion'),
    };

    try {
      await this.prepareLiveStream(creds, 1);
      await verifyRtspVideo(this.getLiveStreamUrl(creds, 1), creds);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RTSP video verification failed';
      const authenticationFailed = /authentication failed/i.test(message);
      return {
        ok: false,
        status: authenticationFailed ? 'authentication_failed' : 'connection_error',
        message: authenticationFailed
          ? 'HTTP authentication succeeded, but RTSP authentication was rejected. Check RTSP access and live-view permissions for this account.'
          : `HTTP authentication succeeded, but channel 1 RTSP verification failed: ${message}`,
        deviceInfo,
      };
    }

    return {
      ok: true,
      status: 'online',
      message: 'HTTP authentication succeeded and video packets were received from RTSP channel 1.',
      deviceInfo,
    };
  }

  async discoverCameras(creds: NvrCredentials): Promise<DiscoveredChannel[]> {
    const client = createNvrHttpClient(creds);
    const proxyResponse = await client.get('/ISAPI/ContentMgmt/InputProxy/channels');
    if (proxyResponse.status === 401) throw new Error('Authentication failed — check username/password');
    let channels = parseHikvisionChannelList(proxyResponse.data, 'InputProxyChannel');

    if (channels.length === 0) {
      const streamResponse = await client.get('/ISAPI/Streaming/channels');
      if (streamResponse.status === 401) throw new Error('Authentication failed — check username/password');
      channels = parseHikvisionChannelList(streamResponse.data, 'StreamingChannel');
    }

    if (channels.length === 0) {
      // Some firmware does not return a collection; probe common channel IDs.
      for (let i = 1; i <= 16; i++) {
        const probe = await client.get(`/ISAPI/Streaming/channels/${i}01`);
        if (probe.status === 200 && probe.data) {
          channels.push({
            channelNumber: i,
            name: readChannelValue(probe.data, ['channelName', 'name']) ?? `Camera ${i}`,
            status: 'unknown',
            rtspUrl: this.getLiveStreamUrl(creds, i),
          });
        }
      }
    }
    return channels;
  }

  getLiveStreamUrl(creds: NvrCredentials, channelNumber: number): string {
    const substreamChannel = channelNumber * 100 + 2;
    return `${rtspBase(creds)}/Streaming/Channels/${substreamChannel}`;
  }

  async prepareLiveStream(creds: NvrCredentials, channelNumber: number): Promise<void> {
    const client = createNvrHttpClient(creds, 15000);
    for (const streamId of [channelNumber * 100 + 1, channelNumber * 100 + 2]) {
      const response = await client.get(`/ISAPI/Streaming/channels/${streamId}`);
      if (response.status !== 200 || typeof response.data !== 'string') {
        throw new Error(`Could not read Hikvision stream ${streamId} configuration`);
      }
      if (!/<videoCodecType>H\.265<\/videoCodecType>/i.test(response.data)) continue;

      const h264Config = response.data.replace(
        /<videoCodecType>H\.265<\/videoCodecType>/i,
        '<videoCodecType>H.264</videoCodecType>',
      );
      const update = await client.put(
        `/ISAPI/Streaming/channels/${streamId}`,
        h264Config,
        { headers: { 'Content-Type': 'application/xml' } },
      );
      if (update.status < 200 || update.status >= 300) {
        throw new Error(`Could not configure Hikvision stream ${streamId} as H.264 (HTTP ${update.status})`);
      }
    }
  }

  async searchRecordings(creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<RecordingSegment[]> {
    const client = createNvrHttpClient(creds, 15000);
    const payload = buildHikvisionSearchXml(channelNumber, start, end);
    const res = await client.post('/ISAPI/ContentMgmt/search', payload, {
      headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' },
    });
    if (res.status === 401) throw new Error('Authentication failed');
    if (res.status !== 200) {
      const detail = responseMessage(res.data);
      throw new Error(`Recording search failed (HTTP ${res.status})${detail ? `: ${detail}` : ''}`);
    }
    return parseHikvisionSearchResponse(res.data, channelNumber);
  }

  async startPlayback(creds: NvrCredentials, channelNumber: number, start: Date, end: Date): Promise<PlaybackSession> {
    const trackId = channelNumber * 100 + 1;
    const params = new URLSearchParams({
      starttime: formatHikvisionRtspTime(start),
      endtime: formatHikvisionRtspTime(end),
    });
    const url = `${rtspBase(creds)}/Streaming/tracks/${trackId}?${params.toString()}`;
    return {
      sessionId: `hik-${channelNumber}-${randomUUID()}`,
      streamUrl: url,
    };
  }

  async stopPlayback(sessionId: string): Promise<void> {
    // ISAPI playback sessions are closed by terminating the MediaMTX path; nothing else needed.
    void sessionId;
  }

}

export function buildHikvisionSearchXml(channelNumber: number, start: Date, end: Date): string {
  const searchId = randomUUID();
  const trackId = channelNumber * 100 + 1;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<CMSearchDescription xmlns="http://www.hikvision.com/ver20/XMLSchema">',
    `<searchID>${searchId}</searchID>`,
    '<trackList>',
    `<trackID>${trackId}</trackID>`,
    '</trackList>',
    '<timeSpanList><timeSpan>',
    `<startTime>${formatHikvisionTime(start)}</startTime>`,
    `<endTime>${formatHikvisionTime(end)}</endTime>`,
    '</timeSpan></timeSpanList>',
    '<maxResults>100</maxResults>',
    '<searchResultPostion>0</searchResultPostion>',
    '<metadataList><metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor></metadataList>',
    '</CMSearchDescription>',
  ].join('');
}

export function parseHikvisionSearchResponse(data: unknown, channelNumber: number): RecordingSegment[] {
  if (typeof data === 'string') {
    const items = [...data.matchAll(/<(?:\w+:)?searchMatchItem\b[^>]*>([\s\S]*?)<\/(?:\w+:)?searchMatchItem\s*>/gi)];
    return items.map((item) => ({
      startTime: parseHikTime(readXmlValue(item[1], 'startTime') ?? ''),
      endTime: parseHikTime(readXmlValue(item[1], 'endTime') ?? ''),
      channel: channelNumber,
    })).filter((segment) => segment.startTime && segment.endTime);
  }

  if (!data || typeof data !== 'object') return [];
  const result = data as Record<string, unknown>;
  const searchResult = (result.CMSearchResult ?? result.SearchResult) as Record<string, unknown> | undefined;
  const list = searchResult?.matchList;
  const matches = Array.isArray(list) ? list : list ? [list] : [];
  return matches.map((item) => {
    const match = item as Record<string, unknown>;
    const timeSpan = (match.timeSpan ?? match) as Record<string, unknown>;
    return {
      startTime: parseHikTime(String(timeSpan.startTime ?? '')),
      endTime: parseHikTime(String(timeSpan.endTime ?? '')),
      channel: channelNumber,
    };
  }).filter((segment) => segment.startTime && segment.endTime);
}

export function formatHikvisionTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function formatHikvisionRtspTime(date: Date): string {
  const value = formatHikvisionTime(date);
  return value.replace(/[-:]/g, '');
}

function responseMessage(data: unknown): string {
  if (typeof data !== 'string') return '';
  return data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function parseHikvisionChannelList(data: unknown, recordName: 'InputProxyChannel' | 'StreamingChannel'): DiscoveredChannel[] {
  const records = channelRecords(data, recordName);
  const discovered = new Map<number, DiscoveredChannel>();

  for (const record of records) {
    const isProxy = recordName === 'InputProxyChannel';
    const idValue = readChannelValue(record, isProxy
      ? ['inputProxyChannelID', 'channelID', 'id']
      : ['channelID', 'id', 'streamingChannelID']);
    if (!idValue) continue;

    const id = Number.parseInt(idValue, 10);
    if (!Number.isInteger(id) || id < 1) continue;
    const channelNumber = id >= 100 ? Math.floor(id / 100) : id;
    if (discovered.has(channelNumber)) continue;

    const enabled = readChannelValue(record, ['enabled']);
    const rawName = readChannelValue(record, ['name', 'channelName', 'inputProxyChannelName']);
    const name = rawName && /^\d{3,4}$/.test(rawName) && Math.floor(Number(rawName) / 100) === channelNumber
      ? undefined
      : rawName;
    discovered.set(channelNumber, {
      channelNumber,
      name: name ?? `Camera ${channelNumber}`,
      status: enabled?.toLowerCase() === 'false' ? 'offline' : 'unknown',
    });
  }

  return [...discovered.values()];
}

function channelRecords(data: unknown, recordName: 'InputProxyChannel' | 'StreamingChannel'): unknown[] {
  if (typeof data === 'string') {
    const tag = recordName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(
      `<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}\\s*>`,
      'gi',
    );
    return [...data.matchAll(expression)].map((match) => match[1]);
  }
  if (!data || typeof data !== 'object') return [];

  const response = data as Record<string, unknown>;
  const listName = recordName === 'InputProxyChannel' ? 'InputProxyChannelList' : 'StreamingChannelList';
  const list = response[listName];
  if (list && typeof list === 'object') {
    const records = (list as Record<string, unknown>)[recordName];
    if (records !== undefined) return Array.isArray(records) ? records : [records];
  }
  const fallback = response.channelList;
  return Array.isArray(fallback) ? fallback : fallback ? [fallback] : [];
}

function readChannelValue(record: unknown, tags: string[]): string | undefined {
  if (typeof record === 'string') {
    for (const tag of tags) {
      const value = readXmlValue(record, tag);
      if (value) return value;
    }
    return undefined;
  }
  if (!record || typeof record !== 'object') return undefined;

  const values = record as Record<string, unknown>;
  for (const tag of tags) {
    const value = values[tag];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return undefined;
}

function readXmlValue(xml: string, tag: string): string | undefined {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<(?:(?:\\w+):)?${escapedTag}\\b[^>]*>([^<]*)<\\/(?:(?:\\w+):)?${escapedTag}\\s*>`, 'i'));
  return match?.[1]?.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'") || undefined;
}

function formatHikTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function parseHikTime(s: string): string {
  const value = new Date(s);
  return Number.isNaN(value.getTime()) ? '' : value.toISOString();
}
