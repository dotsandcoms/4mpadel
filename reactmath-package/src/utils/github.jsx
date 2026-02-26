/**
 * GitHub API Utility
 * Enables saving SEO config files directly to GitHub repository
 */

const GITHUB_API = 'https://api.github.com';

/**
 * Get file content and SHA from GitHub
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - File path in repo
 * @param {string} token - GitHub personal access token
 * @returns {Promise<{content: string, sha: string}>}
 */
export async function getFileContent(owner, repo, path, token) {
    const response = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
        {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        }
    );

    if (!response.ok) {
        if (response.status === 404) {
            return { content: null, sha: null };
        }
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch file from GitHub');
    }

    const data = await response.json();
    const content = atob(data.content);
    return { content, sha: data.sha };
}

/**
 * Update or create a file in GitHub
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name  
 * @param {string} path - File path in repo
 * @param {string} content - File content (will be base64 encoded)
 * @param {string} message - Commit message
 * @param {string} token - GitHub personal access token
 * @param {string|null} sha - Current file SHA (required for updates, null for new files)
 * @returns {Promise<{success: boolean, commitUrl: string}>}
 */
export async function updateFile(owner, repo, path, content, message, token, sha = null) {
    const body = {
        message,
        content: btoa(unescape(encodeURIComponent(content))), // Handle unicode properly
        branch: 'main'
    };

    if (sha) {
        body.sha = sha;
    }

    const response = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
        {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update file on GitHub');
    }

    const data = await response.json();
    return {
        success: true,
        commitUrl: data.commit.html_url,
        sha: data.content.sha
    };
}

/**
 * Test GitHub connection
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} token - GitHub personal access token
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function testConnection(owner, repo, token) {
    try {
        const response = await fetch(
            `${GITHUB_API}/repos/${owner}/${repo}`,
            {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (!response.ok) {
            if (response.status === 401) {
                return { success: false, message: 'Invalid token. Please check your Personal Access Token.' };
            }
            if (response.status === 404) {
                return { success: false, message: 'Repository not found. Check owner and repo name.' };
            }
            const error = await response.json();
            return { success: false, message: error.message };
        }

        const data = await response.json();
        return {
            success: true,
            message: `Connected to ${data.full_name}`,
            permissions: data.permissions
        };
    } catch (err) {
        return { success: false, message: `Connection failed: ${err.message}` };
    }
}

/**
 * Save SEO config to GitHub
 * @param {Object} config - The SEO configuration object
 * @param {Object} settings - GitHub settings {owner, repo, token}
 * @returns {Promise<{success: boolean, commitUrl?: string, error?: string}>}
 */
export async function saveConfigToGitHub(config, settings) {
    const { owner, repo, token } = settings;
    const path = 'src/seo/seo.config.json';

    try {
        // Get current file to get SHA
        const { sha } = await getFileContent(owner, repo, path, token);

        // Format config nicely
        const content = JSON.stringify(config, null, 4);

        // Commit the update
        const result = await updateFile(
            owner,
            repo,
            path,
            content,
            `[SEO] Update config via Admin Panel`,
            token,
            sha
        );

        return result;
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Save redirects to GitHub
 * @param {Array} redirects - Array of redirect rules
 * @param {Object} settings - GitHub settings {owner, repo, token}
 * @returns {Promise<{success: boolean, commitUrl?: string, error?: string}>}
 */
export async function saveRedirectsToGitHub(redirects, settings) {
    const { owner, repo, token } = settings;
    const path = 'src/seo/redirects.json';

    try {
        // Get current file to get SHA
        const { sha } = await getFileContent(owner, repo, path, token);

        // Format redirects nicely
        const content = JSON.stringify(redirects, null, 4);

        // Commit the update
        const result = await updateFile(
            owner,
            repo,
            path,
            content,
            `[SEO] Update redirects via Admin Panel`,
            token,
            sha
        );

        return result;
    } catch (err) {
        return { success: false, error: err.message };
    }
}

export default {
    getFileContent,
    updateFile,
    testConnection,
    saveConfigToGitHub,
    saveRedirectsToGitHub
};
