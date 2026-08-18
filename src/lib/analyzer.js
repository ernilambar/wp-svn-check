import { fetchRaw, fetchDirectory } from './fetcher.js'
import { parseReadme } from './parse-readme.js'
import { parsePluginHeaders } from './parse-plugin-headers.js'
import { createReportBuilder } from './report.js'
import { buildBaseUrl, isSafeSegment } from './slug.js'

const README_CANDIDATES = ['readme.txt', 'README.txt', 'readme.md', 'README.md']
const SKIP_PHP_FILES = ['uninstall.php']
const BANNER_PATTERN = /^banner-\d+x\d+\.(png|jpg)$/i
const ICON_PATTERN = /^icon(-\d+x\d+\.(png|jpg)|\.svg)$/i
const ROOT_ALLOWED_NAMES = ['assets', 'branches', 'tags', 'trunk']
const ASSETS_ALLOWED_EXTENSIONS = ['jpg', 'png', 'svg', 'gif']
const ASSETS_ALLOWED_DIRS = ['blueprints']
const PLUGIN_API_BASE_URL = 'https://api.wordpress.org/plugins/info/1.0/'

function baseName (name) {
  return name.replace(/\/+$/, '')
}

function extensionOf (name) {
  const match = /\.([^.]+)$/.exec(name)
  return match ? match[1].toLowerCase() : ''
}

/**
 * Try each relative path in order, returning the first HTTP 200. Keeps every
 * attempt so the resolve-phase bail-out can tell a real "all 404" from a
 * transport-dead mirror.
 */
async function fetchFirstOk (baseUrl, relativePaths) {
  const attempts = []

  for (const relativePath of relativePaths) {
    const result = await fetchRaw(baseUrl, relativePath)
    attempts.push(result)

    if (result.code === 200) {
      return { ...result, ok: true, attempts }
    }
  }

  return { code: 0, body: '', transportError: false, ok: false, attempts }
}

/**
 * Scan a pre-fetched trunk/ listing for the main plugin PHP file: {slug}.php
 * first, then the rest in listing order, first whose body contains the
 * literal "Plugin Name:" wins. Returns the content too, so the caller never
 * re-fetches it.
 */
async function findMainPluginFile (baseUrl, slug, trunkItems) {
  const slugPhp = `${slug}.php`
  const first = []
  const rest = []

  for (const item of trunkItems) {
    if (item.is_dir) {
      continue
    }

    const name = item.name

    if (!/\.php$/i.test(name) || SKIP_PHP_FILES.includes(name)) {
      continue
    }

    if (name === slugPhp) {
      first.push(name)
    } else {
      rest.push(name)
    }
  }

  for (const name of [...first, ...rest]) {
    if (!isSafeSegment(name)) {
      continue
    }

    const result = await fetchRaw(baseUrl, `trunk/${name}`)

    if (result.code === 200 && result.body.includes('Plugin Name:')) {
      return { file: name, content: result.body }
    }
  }

  return { file: null, content: '' }
}

/**
 * Flag any file whose name ends in .zip sitting directly inside a folder —
 * mirrors checkUnexpectedPluginFiles() in svncheck.php.
 */
function addZipFileCheck (builder, label, items) {
  const zipFiles = items.filter((item) => !item.is_dir && extensionOf(item.name) === 'zip').map((item) => item.name)

  builder.check(
    label,
    zipFiles.length ? 'fail' : 'pass',
    zipFiles.length ? `Unexpected .zip file(s) found: ${zipFiles.join(', ')}` : 'None found'
  )
}

/**
 * Add checks for the tags/{stable_tag}/ folder: readme.txt fallback chain,
 * stable-tag-matches-trunk, main PHP file, version-matches-trunk.
 */
async function addStableTagChecks (builder, baseUrl, tag, pluginFile, trunkStable, trunkVersion, tagItems) {
  const readmeResult = await fetchFirstOk(baseUrl, README_CANDIDATES.map((name) => `tags/${tag}/${name}`))
  const readmeOk = readmeResult.ok

  builder.check(
    'readme.txt found',
    readmeOk ? 'pass' : 'fail',
    readmeOk ? `tags/${tag}/readme.txt` : `tags/${tag}/readme.txt is missing`
  )

  if (readmeOk) {
    const readmeData = parseReadme(readmeResult.body)
    const tagStable = readmeData.stable_tag ?? null

    builder.check(
      'Stable tag declared',
      tagStable ? 'pass' : 'fail',
      tagStable || '"Stable tag:" not found'
    )

    if (trunkStable && tagStable) {
      const match = tagStable === trunkStable
      builder.check(
        'readme stable tag matches trunk',
        match ? 'pass' : 'fail',
        `${tagStable} === ${trunkStable}`
      )
    }
  }

  const phpResult = await fetchRaw(baseUrl, `tags/${tag}/${pluginFile}`)
  const phpOk = phpResult.code === 200

  builder.check(
    'Main PHP file found',
    phpOk ? 'pass' : 'fail',
    phpOk ? `tags/${tag}/${pluginFile}` : `tags/${tag}/${pluginFile} is missing`
  )

  if (phpOk) {
    const phpData = parsePluginHeaders(phpResult.body)
    const phpVersion = phpData.Version ?? null

    builder.check(
      'Version declared',
      phpVersion ? 'pass' : 'fail',
      phpVersion || '"Version:" header not found'
    )

    if (trunkVersion && phpVersion) {
      const match = phpVersion === trunkVersion
      builder.check(
        'PHP version matches trunk',
        match ? 'pass' : 'fail',
        `${phpVersion} === ${trunkVersion}`
      )
    }

    const phpRequiresPlugins = phpData['Requires Plugins'] ?? null

    builder.check(
      'Requires Plugins declared',
      'info',
      phpRequiresPlugins || 'Not set — optional'
    )
  }

  addZipFileCheck(builder, 'No unexpected .zip files', tagItems)
}

function addAssetsChecks (builder, items) {
  let bannerFile = null
  let iconFile = null
  let hasBlueprintsDir = false
  const unexpectedFiles = []

  for (const item of items) {
    const name = baseName(item.name)

    if (!bannerFile && BANNER_PATTERN.test(name)) {
      bannerFile = name
    }
    if (!iconFile && ICON_PATTERN.test(name)) {
      iconFile = name
    }

    if (item.is_dir) {
      if (name === 'blueprints') {
        hasBlueprintsDir = true
      } else if (!ASSETS_ALLOWED_DIRS.includes(name)) {
        unexpectedFiles.push(item.name)
      }
    } else if (!ASSETS_ALLOWED_EXTENSIONS.includes(extensionOf(name))) {
      unexpectedFiles.push(item.name)
    }
  }

  builder.check(
    'No unexpected files/directories',
    unexpectedFiles.length ? 'fail' : 'pass',
    unexpectedFiles.length ? `Unexpected files/directories found: ${unexpectedFiles.join(', ')}` : 'None found'
  )

  builder.check(
    'Banner image present',
    bannerFile ? 'pass' : 'info',
    bannerFile ?? 'banner-772x250.(png|jpg) not found — optional'
  )

  builder.check(
    'Icon image present',
    iconFile ? 'pass' : 'info',
    iconFile ?? 'icon-128x128.(png|jpg) or icon.svg not found — optional'
  )

  return { hasBlueprintsDir }
}

async function addBlueprintCheck (builder, baseUrl) {
  const result = await fetchRaw(baseUrl, 'assets/blueprints/blueprint.json')
  const found = result.code === 200

  builder.check(
    'blueprints/blueprint.json present',
    'info',
    found
      ? 'Found — Live Preview is active'
      : 'Not found — optional but needed to activate Live Preview'
  )
}

async function addRequiredPluginsChecks (builder, requiresPlugins) {
  const slugs = requiresPlugins
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)

  if (!slugs.length) {
    return
  }

  for (const slug of slugs) {
    if (!isSafeSegment(slug)) {
      builder.check(
        `Required plugin "${slug}" exists`,
        'fail',
        'Invalid plugin slug'
      )
      continue
    }

    const result = await fetchRaw(PLUGIN_API_BASE_URL, slug)
    const exists = result.code === 200
    const status = exists ? 'pass' : (result.transportError ? 'warn' : 'fail')

    builder.check(
      `Required plugin "${slug}" exists`,
      status,
      exists
        ? 'Found in the WordPress.org plugin directory'
        : (result.transportError
            ? 'Could not verify — WordPress.org plugin API is unreachable'
            : 'Not found in the WordPress.org plugin directory')
    )
  }
}

/**
 * Fetches a plugin's SVN repo and builds a report. The resolve-phase
 * not_found/unreachable bail-out below distinguishes a genuinely missing
 * plugin from a mirror that couldn't be reached, rather than collapsing
 * both into "not found".
 */
export async function analyze (slug) {
  const baseUrl = buildBaseUrl(slug)
  const builder = createReportBuilder(slug)

  const readmeResult = await fetchFirstOk(baseUrl, README_CANDIDATES.map((name) => `trunk/${name}`))
  const readmeOk = readmeResult.ok
  const readmeData = readmeOk ? parseReadme(readmeResult.body) : {}

  const trunkDir = await fetchDirectory(baseUrl, 'trunk/')
  const trunkExists = trunkDir.exists || readmeOk

  if (!trunkExists) {
    const resolveAttempts = [...readmeResult.attempts, { transportError: trunkDir.transportError }]
    const anyRealResponse = resolveAttempts.some((attempt) => !attempt.transportError)

    return builder
      .meta({ error: anyRealResponse ? 'not_found' : 'unreachable', svn_url: baseUrl })
      .build()
  }

  const { file: pluginFile, content: phpContent } = await findMainPluginFile(baseUrl, slug, trunkDir.items)
  const phpData = phpContent ? parsePluginHeaders(phpContent) : {}

  const rootDir = await fetchDirectory(baseUrl, '')

  const tagsDir = await fetchDirectory(baseUrl, 'tags/')
  const tagsExists = tagsDir.exists

  const assetsDir = await fetchDirectory(baseUrl, 'assets/')
  const assetsExists = assetsDir.exists

  const rawStableTag = readmeData.stable_tag ?? null
  const stableTag = rawStableTag && isSafeSegment(rawStableTag) ? rawStableTag : null
  const trunkVersion = phpData.Version ?? null
  const requiresPlugins = phpData['Requires Plugins'] ?? null

  builder.meta({
    plugin_name: readmeData.name ?? null,
    plugin_file: pluginFile,
    stable_tag: stableTag,
    trunk_version: trunkVersion,
    requires_plugins: requiresPlugins,
    requires_php: readmeData.requires_php ?? null,
    tested_up_to: readmeData.tested_up_to ?? null,
    svn_url: baseUrl
  })

  builder
    .section('root', 'Main SVN Folder')
    .check('trunk/ exists', trunkExists ? 'pass' : 'fail', trunkExists ? 'Found' : 'Missing')
    .check('tags/ exists', tagsExists ? 'pass' : 'fail', tagsExists ? 'Found' : 'Missing')
    .check('assets/ exists', assetsExists ? 'pass' : 'warn', assetsExists ? 'Found' : 'Missing — optional but recommended')

  const unexpectedRootFiles = rootDir.items.filter((item) => !ROOT_ALLOWED_NAMES.includes(baseName(item.name))).map((item) => item.name)

  builder.check(
    'No unexpected files/directories',
    unexpectedRootFiles.length ? 'fail' : 'pass',
    unexpectedRootFiles.length ? `Unexpected files/directories found: ${unexpectedRootFiles.join(', ')}` : 'None found'
  )

  const unexpectedTagsFiles = tagsDir.items.filter((item) => !item.is_dir).map((item) => item.name)

  builder.check(
    'No unexpected files at tags/',
    unexpectedTagsFiles.length ? 'fail' : 'pass',
    unexpectedTagsFiles.length ? `Unexpected files found at tags/: ${unexpectedTagsFiles.join(', ')}` : 'None found'
  )

  builder.section('trunk', 'Trunk')

  builder.check(
    'readme.txt found',
    readmeOk ? 'pass' : 'fail',
    readmeOk ? 'trunk/readme.txt' : 'trunk/readme.txt is missing'
  )

  builder.check(
    'Stable tag declared',
    stableTag ? 'pass' : 'fail',
    stableTag || '"Stable tag:" not found in trunk/readme.txt'
  )

  builder.check(
    'Main plugin PHP file found',
    pluginFile ? 'pass' : 'warn',
    pluginFile ? `trunk/${pluginFile}` : 'No PHP file with "Plugin Name:" header found in trunk/'
  )

  builder.check(
    'Version declared in PHP header',
    trunkVersion ? 'pass' : (pluginFile ? 'fail' : 'warn'),
    trunkVersion || (pluginFile ? `No "Version:" header in trunk/${pluginFile}` : 'Skipped — plugin PHP file not found')
  )

  if (stableTag && trunkVersion) {
    const match = stableTag === trunkVersion
    builder.check(
      'Stable tag matches PHP version',
      match ? 'pass' : 'fail',
      match ? `${stableTag} === ${trunkVersion}` : `readme=${stableTag}, php=${trunkVersion}`
    )
  } else {
    builder.check('Stable tag matches PHP version', 'warn', 'Cannot compare — one or both values missing')
  }

  builder.check(
    'Requires Plugins declared',
    'info',
    requiresPlugins || 'Not set — optional'
  )

  addZipFileCheck(builder, 'No unexpected .zip files', trunkDir.items)

  if (requiresPlugins) {
    await addRequiredPluginsChecks(builder, requiresPlugins)
  }

  if (stableTag) {
    builder.section('stable_tag', `tags/${stableTag}/`)

    const tagDir = await fetchDirectory(baseUrl, `tags/${stableTag}/`)
    const tagExists = tagDir.exists

    builder.check(
      `tags/${stableTag}/ exists`,
      tagExists ? 'pass' : 'fail',
      tagExists ? 'Found' : `tags/${stableTag}/ not found`
    )

    if (tagExists && pluginFile) {
      await addStableTagChecks(builder, baseUrl, stableTag, pluginFile, stableTag, trunkVersion, tagDir.items)
    }
  }

  builder.section('assets', 'Assets')
  const { hasBlueprintsDir } = addAssetsChecks(builder, assetsDir.items)

  if (hasBlueprintsDir) {
    await addBlueprintCheck(builder, baseUrl)
  }

  return builder.build()
}
