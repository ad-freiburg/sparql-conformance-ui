/**
 * API Configuration and base URL
 */
import { getRuntimeBasePath } from '../utils/basePath.js';

function getDefaultApiBaseUrl() {
  return `${getRuntimeBasePath()}api`;
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || getDefaultApiBaseUrl();

function getApiRootUrl() {
  const base = API_BASE_URL.replace(/\/$/, '');
  if (base.endsWith('/api')) {
    return base.slice(0, -4) || '/';
  }
  return base;
}

function joinApiUrl(path) {
  const base = API_BASE_URL.replace(/\/$/, '');
  let normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Avoid duplicate /api when base itself already ends with /api.
  if (base.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    normalizedPath = normalizedPath.slice(4);
  }

  return `${base}${normalizedPath}`;
}

export const API_ENDPOINTS = {
  search: (query, filters = {}) => {
    const params = new URLSearchParams();
    params.append('q', query);
    if (filters.source) params.append('source', filters.source);
    return `${joinApiUrl('/api/search')}?${params.toString()}`;
  },
  runs: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.repo) params.append('repo', filters.repo);
    if (filters.engine) params.append('engine', filters.engine);
    if (filters.version) params.append('version', filters.version);
    if (filters.source) params.append('source', filters.source);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    return `${joinApiUrl('/api/runs')}${params.toString() ? '?' + params.toString() : ''}`;
  },
  runById: (id) => joinApiUrl(`/api/runs/${id}`),
  latestMaster: (repo) => `${joinApiUrl('/api/latest-master')}?repo=${encodeURIComponent(repo)}`,
  upload: joinApiUrl('/api/upload'),
  health: `${getApiRootUrl().replace(/\/$/, '')}/health`,
};
