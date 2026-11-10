(() => {
  const releaseUrl =
    'https://github.com/RYMegumi/floating-notes-public/releases/latest'
  const apiUrl =
    'https://api.github.com/repos/RYMegumi/floating-notes-public/releases/latest'
  const isMac =
    /Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
    /Macintosh|Mac OS X/.test(navigator.userAgent)
  const platform = isMac ? 'macOS' : 'Windows'
  const extension = isMac ? '.dmg' : '.exe'

  const buttons = [...document.querySelectorAll('[data-download]')]
  const platformLabels = [...document.querySelectorAll('[data-platform-label]')]
  const versionLabels = [...document.querySelectorAll('[data-release-version]')]

  function language() {
    return document.documentElement.dataset.lang === 'en' ? 'en' : 'zh'
  }

  function updateLabels() {
    const lang = language()
    buttons.forEach((button) => {
      button.textContent =
        lang === 'en' ? `Download for ${platform}` : `下载 ${platform} 版`
    })
    platformLabels.forEach((label) => {
      label.textContent = isMac ? 'macOS' : 'Windows 10 / 11'
    })
  }

  updateLabels()
  window.addEventListener('fujian:languagechange', updateLabels)

  fetch(apiUrl, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store'
  })
    .then((response) => {
      if (!response.ok) throw new Error(`GitHub release request failed: ${response.status}`)
      return response.json()
    })
    .then((release) => {
      versionLabels.forEach((label) => {
        if (typeof release.tag_name === 'string') {
          label.textContent = release.tag_name.replace(/^v/, '')
        }
      })

      const asset = Array.isArray(release.assets)
        ? release.assets.find(
            (item) =>
              typeof item.name === 'string' &&
              item.name.toLowerCase().endsWith(extension) &&
              typeof item.browser_download_url === 'string'
          )
        : null

      if (asset) {
        buttons.forEach((button) => {
          button.href = asset.browser_download_url
        })
      }
    })
    .catch(() => {
      // The release page is a safe fallback when the API is unavailable.
      buttons.forEach((button) => {
        button.href = releaseUrl
      })
    })
})()
