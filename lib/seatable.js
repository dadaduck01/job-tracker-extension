// SeaTable REST API client for Chrome Extension
// API v5.2+ using api-gateway endpoints

const SEATABLE_DEFAULT_SERVER = 'https://cloud.seatable.cn';

/**
 * SeaTableClient - handles auth and row operations
 */
export class SeaTableClient {
  /**
   * @param {string} serverUrl - e.g. https://cloud.seatable.cn
   * @param {string} apiToken - API Token from SeaTable UI (40 chars)
   */
  constructor(serverUrl, apiToken) {
    this.serverUrl = (serverUrl || SEATABLE_DEFAULT_SERVER).replace(/\/$/, '');
    this.apiToken = apiToken;
    this.baseToken = null;
    this.baseUuid = null;
  }

  /**
   * Exchange API-Token for a Base-Token (JWT, expires in 3 days by default)
   * Endpoint: GET /api/v2.1/dtable/app-access-token/
   * @returns {Promise<{access_token: string, dtable_uuid: string, dtable_server: string}>}
   */
  async getBaseToken() {
    const url = `${this.serverUrl}/api/v2.1/dtable/app-access-token/`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`SeaTable 认证失败 (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    this.baseToken = data.access_token;
    this.baseUuid = data.dtable_uuid;
    return data;
  }

  /**
   * Ensure we have a valid base token, refreshing if needed
   */
  async ensureAuth() {
    if (!this.baseToken) {
      await this.getBaseToken();
    }
  }

  /**
   * Append a single row to the table
   * @param {string} tableName
   * @param {Object} rowData - { "列名": "值", ... }
   * @returns {Promise<Object>} created row data
   */
  async appendRow(tableName, rowData) {
    await this.ensureAuth();

    const url = `${this.serverUrl}/api-gateway/api/v2/dtables/${this.baseUuid}/rows/`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.baseToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        table_name: tableName,
        rows: [rowData]
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`SeaTable 写入失败 (${resp.status}): ${text}`);
    }

    const result = await resp.json();
    return result;
  }

  /**
   * List rows from the table
   * @param {string} tableName
   * @param {string} [viewName]
   * @returns {Promise<Array>} array of row objects
   */
  async listRows(tableName, viewName) {
    await this.ensureAuth();

    const params = new URLSearchParams({ table_name: tableName });
    if (viewName) params.append('view_name', viewName);

    const url = `${this.serverUrl}/api-gateway/api/v2/dtables/${this.baseUuid}/rows/?${params}`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.baseToken}`,
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`SeaTable 查询失败 (${resp.status}): ${text}`);
    }

    return resp.json();
  }

  /**
   * Check if a row with the given link already exists
   * @param {string} tableName
   * @param {string} link
   * @returns {Promise<boolean>}
   */
  async hasDuplicateLink(tableName, link) {
    if (!link) return false;
    try {
      const rows = await this.listRows(tableName);
      // rows is { rows: [...] } or an array
      const rowList = Array.isArray(rows) ? rows : (rows.rows || []);
      return rowList.some(row => row['链接'] === link);
    } catch {
      return false; // if query fails, don't block the save
    }
  }
}
