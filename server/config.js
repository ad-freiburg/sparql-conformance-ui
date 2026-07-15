/**
 * Decodes a potentially base64-encoded private key
 * GitHub App private keys can be stored as base64 in env vars to avoid newline issues
 */
function decodePrivateKey(key) {
  if (!key) return null;
  
  // If it already looks like a PEM key, return as-is
  if (key.includes('-----BEGIN')) {
    return key;
  }
  
  // Try to decode from base64
  try {
    const decoded = Buffer.from(key, 'base64').toString('utf-8');
    if (decoded.includes('-----BEGIN')) {
      return decoded;
    }
  } catch {
    // Not base64, return original
  }
  
  return key;
}

/**
 * Configuration object with environment variable mappings
 * All values are lazily evaluated when accessed
 */
const config = {
  // Server settings
  get port() {
    return parseInt(process.env.PORT, 10) || 3000;
  },
  
  get host() {
    return process.env.HOST || '0.0.0.0';
  },

  get logLevel() {
    return process.env.LOG_LEVEL || 'info';
  },

  get appMode() {
    const mode = (process.env.APP_MODE || 'public').toLowerCase();
    return mode === 'private' ? 'private' : 'public';
  },

  get isPrivateMode() {
    return this.appMode === 'private';
  },

  get apiSurface() {
    const mode = (process.env.API_SURFACE || 'all').toLowerCase();
    return ['all', 'read', 'upload'].includes(mode) ? mode : 'all';
  },

  get localResultsDir() {
    return process.env.LOCAL_RESULTS_DIR || null;
  },

  get privateAutoImport() {
    const value = (process.env.PRIVATE_AUTO_IMPORT || 'true').toLowerCase();
    return value !== 'false';
  },
  
  // API authentication
  get apiKey() {
    return process.env.API_KEY;
  },

  // API key that protects the destructive DELETE endpoint. Kept separate from
  // API_KEY so the upload key (shared with CI) cannot delete runs. If
  // DELETE_API_KEY is not set, we fall back to API_KEY so a single-key setup
  // still works.
  get deleteApiKey() {
    return process.env.DELETE_API_KEY || process.env.API_KEY;
  },
  
  // GitHub App settings
  get githubAppId() {
    const id = process.env.GITHUB_APP_ID;
    return id ? parseInt(id, 10) : null;
  },
  
  get githubPrivateKey() {
    return decodePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY);
  },
  
  get githubInstallationId() {
    const id = process.env.GITHUB_INSTALLATION_ID;
    return id ? parseInt(id, 10) : null;
  },

  // UI and display settings
  // Public URL of the website, used only for links in GitHub PR comments / check runs.
  // Set WEBSITE_URL to the full public URL (e.g. https://qlever.dev/sparql-conformance-ui-v2/).
  // This can't be inferred from an upload request (uploads hit the separate uploader service,
  // not the website), so when unset we fall back to a localhost dev origin.
  get websiteUrl() {
    return process.env.WEBSITE_URL || 'http://localhost:5173';
  },
  
  get checkName() {
    return process.env.CHECK_NAME || 'SPARQL 1.1 Conformance Check';
  },
  
  get checkTitle() {
    return process.env.CHECK_TITLE || 'SPARQL Test Suite';
  },
  
  get checkRunningTitle() {
    return process.env.CHECK_RUNNING_TITLE || 'Running SPARQL Test Suite';
  },
  
  get commentAuthor() {
    return process.env.COMMENT_AUTHOR || 'conformance-test[bot]';
  },
  
  /**
   * Check if GitHub App is configured
   */
  get isGitHubAppConfigured() {
    if (this.isPrivateMode) {
      return false;
    }

    return !!(this.githubAppId && this.githubPrivateKey && this.githubInstallationId);
  },
  
  /**
   * Validate required configuration for a specific feature
   */
  validate(feature = 'basic') {
    const errors = [];
    
    if (feature === 'upload' && !this.apiKey) {
      errors.push('API_KEY is required for upload endpoint');
    }
    
    if (feature === 'github') {
      if (!this.githubAppId) errors.push('GITHUB_APP_ID is required');
      if (!this.githubPrivateKey) errors.push('GITHUB_APP_PRIVATE_KEY is required');
      if (!this.githubInstallationId) errors.push('GITHUB_INSTALLATION_ID is required');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};

export default config;
