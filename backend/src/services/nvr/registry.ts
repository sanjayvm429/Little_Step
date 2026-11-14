import { INvrAdapter, NvrCredentials } from './types.js';
import { NvrBrand } from '../../models/NvrDevice.js';
import { HikvisionAdapter } from './adapters/hikvision.js';
import { DahuaAdapter } from './adapters/dahua.js';
import { GenericAdapter } from './adapters/generic.js';
import { DirectRtspAdapter } from './adapters/directRtsp.js';

const brandAdapters = new Map<NvrBrand, INvrAdapter>();

export function registerAdapter(adapter: INvrAdapter) {
  brandAdapters.set(adapter.brand, adapter);
}

registerAdapter(new HikvisionAdapter());
registerAdapter(new DahuaAdapter());
registerAdapter(new GenericAdapter()); // fallback for 'other' and unlisted brands

const directRtspAdapter = new DirectRtspAdapter();

/**
 * Resolve the adapter for a brand + connection type.
 * - direct_rtsp always uses DirectRtspAdapter.
 * - Known brands use their adapter; unknown brands fall back to GenericAdapter.
 */
export function getAdapter(brand: NvrBrand, connectionType: 'http_rtsp' | 'direct_rtsp'): INvrAdapter {
  if (connectionType === 'direct_rtsp') return directRtspAdapter;
  return brandAdapters.get(brand) ?? brandAdapters.get('other')!;
}

export function getAdapterCapabilities(brand: NvrBrand, connectionType: 'http_rtsp' | 'direct_rtsp') {
  const a = getAdapter(brand, connectionType);
  return {
    supportsDiscovery: a.supportsDiscovery,
    supportsPlayback: a.supportsPlayback,
  };
}

export type { INvrAdapter, NvrCredentials };
