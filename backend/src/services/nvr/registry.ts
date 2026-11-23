import { INvrAdapter, NvrCredentials } from './types.js';
import { NvrBrand } from '../../models/NvrDevice.js';
import { HikvisionAdapter } from './adapters/hikvision.js';
import { DahuaAdapter } from './adapters/dahua.js';
import { CpPlusAdapter } from './adapters/cpplus.js';
import { UniviewAdapter } from './adapters/uniview.js';
import { GenericAdapter } from './adapters/generic.js';
import { DirectRtspAdapter } from './adapters/directRtsp.js';

const brandAdapters = new Map<NvrBrand, INvrAdapter>();

export function registerAdapter(adapter: INvrAdapter) {
  brandAdapters.set(adapter.brand, adapter);
}

const hikvisionAdapter = new HikvisionAdapter();
const dahuaAdapter = new DahuaAdapter();
const cpPlusAdapter = new CpPlusAdapter();
const univiewAdapter = new UniviewAdapter();
const genericAdapter = new GenericAdapter();
const directRtspAdapter = new DirectRtspAdapter();

registerAdapter(hikvisionAdapter);
registerAdapter(dahuaAdapter);
registerAdapter(cpPlusAdapter);
registerAdapter(univiewAdapter);
registerAdapter(genericAdapter);

// Explicit aliases for all supported brands to ensure clean lookup
brandAdapters.set('axis', genericAdapter);
brandAdapters.set('hanwha', genericAdapter);
brandAdapters.set('bosch', genericAdapter);
brandAdapters.set('tvt', genericAdapter);
brandAdapters.set('honeywell', genericAdapter);
brandAdapters.set('other', genericAdapter);

/**
 * Resolve the adapter for a brand + connection type.
 * - direct_rtsp always uses DirectRtspAdapter.
 * - Known brands use their adapter; unknown brands fall back to GenericAdapter.
 */
export function getAdapter(brand: NvrBrand, connectionType: 'http_rtsp' | 'direct_rtsp'): INvrAdapter {
  if (connectionType === 'direct_rtsp') return directRtspAdapter;
  return brandAdapters.get(brand) ?? genericAdapter;
}

export function getAdapterCapabilities(brand: NvrBrand, connectionType: 'http_rtsp' | 'direct_rtsp') {
  const a = getAdapter(brand, connectionType);
  return {
    supportsDiscovery: a.supportsDiscovery,
    supportsPlayback: a.supportsPlayback,
  };
}

export type { INvrAdapter, NvrCredentials };
