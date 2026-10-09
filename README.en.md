# your-portfolio

[简体中文](README.md) | **English**

**Two personal website templates for travelers and creators, built to grow with your story.**

Put the places you've visited on an interactive globe. Give your work a portfolio of its own. Fill in the worksheet, then edit the template yourself or ask an AI assistant to help.

HTML / CSS / JavaScript · No build step · No backend · No npm installation · No CDN · Chinese & English · MIT

| Traveler | Creator |
| --- | --- |
| ![Screenshot of the Traveler template](docs/previews/traveler.png) | ![Screenshot of the Creator template](docs/previews/creator.png) |
| Draggable, zoomable globe, clustered places, travel timeline, repeat visits, photos and optional videos | Selected work, project details, experience timeline, current activities and contact links |

Each template has its own page and content file, with shared functionality. Turn sections on or off and change their order. Creators can add travel records; travelers can display their work. There is no required sports theme, character artwork or voice introduction.

All demo people, travel stories, experiences and projects are fictional. The images are original geometric demo artwork included in the repository. Replace them with your own content.

## Start here

1. Select **Use this template → Create a new repository**, or download the ZIP.
2. Fill in the [worksheet](docs/worksheet.md) with information you want to share publicly.
3. Give the repository files and the [template setup prompt](prompts/use-template.md) to an AI assistant that can read project files, or edit the YAML yourself.
4. Preview locally, check the result and follow the [publishing guide](docs/deploy.md).

The linked worksheets, guides and AI prompts are currently in Chinese.

> A chat assistant that can give advice may not be able to read a repository, edit files on your computer or publish a website. The prompt asks it to explain its capabilities first. Use the prompt together with the project files.

## Preview locally

Run this from the project directory. Python 3 is required:

```bash
python3 -m http.server 8090 --bind 127.0.0.1 --directory public
```

Open <http://127.0.0.1:8090> to choose a template, or visit `/traveler/` or `/creator/` directly. **Do not open the HTML file by double-clicking it:** content is loaded over HTTP.

If you do not have Python, use your editor's local static server. The website itself does not require Node. Node 22+ is needed only for the optional tools and tests below.

## Edit your content file

| Purpose | Path |
| --- | --- |
| Traveler | `public/traveler/content.yaml` |
| Creator | `public/creator/content.yaml` |
| Your images and videos | `public/assets/media/` |
| Shared interface translations | `public/content/ui.yaml` |

Names, introductions, journeys, projects, experience, current activities and contact details come from YAML. `sections` controls the order; `enabled: false` disables a section. Empty sections are hidden automatically. Set `site.languages` to `[zh]` for Chinese only, `[en]` for English only or `[zh, en]` for both.

The [content editing guide](docs/content.md) includes examples for adding journeys, projects and sections. After replacing all demo content, set `site.demo` to `false`.

Choosing a place on the map plays a paper-plane flight lasting about one second, then opens its details. Timeline entries open immediately. Set `trips.flightAnimation` to `false` to disable the flight. Reduced motion, direct detail links and browser back/forward open details directly. The plane and home marker use the template palette, and the departure point comes from `trips.home`.

## Publish one template

```bash
node tools/check-content.mjs
node tools/export.mjs traveler
# Or node tools/export.mjs creator
```

Publish `dist/traveler/` or `dist/creator/` **as the website root**. The output includes only the selected template's content, page and required shared resources. It does not include the other template's content, the worksheet or development documents. Do not upload the entire project directory.

The export tool refuses to overwrite an existing output folder. Keep the previous version and choose a new path, such as `node tools/export.mjs traveler dist/traveler-v2`.

Without the Node tools, you can publish the complete `public/` directory. This makes both templates and the template selection page public. See the [publishing guide](docs/deploy.md).

Share titles and descriptions must be written into static HTML, not just updated after the page loads. Run `node tools/sync-meta.mjs` after content changes; the export tool also updates them. Set `site.url` and a PNG/JPG share image to generate absolute share URLs in the exported HTML. See the [media guide](docs/media.md).

## Three prompts for your AI assistant

- [Set up a website with the template](prompts/use-template.md): keep the implemented features and replace the content with your own.
- [Design your own website, using the template as a reference](prompts/design-your-own.md): choose your requirements and appearance, and specify which features to reuse.
- [Update journeys or projects later](prompts/update.md): keep the existing structure instead of rebuilding the website each time.

## Included features

- Canvas 2D orthographic globe, great-circle routes, place clustering, touch rotation and pinch gestures, keyboard controls and zoom.
- Date-driven journey numbers, repeat visits, country/place statistics and planned trips.
- Deep links for projects and journeys, detail restoration after refresh, browser back, Escape to close and focus restoration.
- Single-language or bilingual content, scroll navigation and reading progress, section switches and ordering, reduced-motion support.
- Content validation, resource checks, static share metadata updates and selected-template export.
- Model/tool tests without npm dependencies, plus Chrome browser checks through CDP.

## Run checks

```bash
node --test tests/*.test.mjs
node tools/check-content.mjs
node tools/check_trips.mjs
node tools/check-flight.mjs
```

The last command requires a local Chrome installation. The default macOS path is configured. On other systems, specify the Chrome executable:

```bash
CHROME=/path/to/google-chrome node tools/check_trips.mjs
```

Browser checks cover both templates, Chinese and English, widths from 320 to 1440px, globe interaction, detail routes, disabled sections, missing images and text escaping. Screenshots are saved in `.local/screenshots/`, which Git ignores. After publishing, check links and video playback on a real phone as well.

## Public content and media

Visitors can download a static website's data files, photos and media. Hiding a field on the page does not make it private. `robots.txt` requests that search engines avoid indexing; **it is not access control**.

The demo asks search engines not to index it. After replacing the examples with your own public content, adjust `public/robots.txt` if needed. Email can be left blank. Birth dates and family information are not required. Keep original media in `inputs/`, which Git ignores, and put only the versions you intend to publish in `public/`.

## License

Original code and geometric demo artwork are licensed under [MIT](LICENSE). Sources and licenses for js-yaml and the map data are listed in [third-party notices](THIRD_PARTY_NOTICES.md). Users choose and manage their own media.

The preview images are actual browser screenshots of this repository's fictional demo pages, not external stock images.
