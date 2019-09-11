# Lighthouse extensions for privacy metrics

Lighthouse is a great tool for automated website testing, but the default audits lack some (in our view) key aspects of page quality: amount of ads and trackers and the impact they have on the page. We add Lighthouse _gatherers_ and _audits_ making use of the [AdBlock-rs](https://github.com/brave/adblock-rust) library to calculate metrics related to ad blocking and repurpose existing Third-Party costing audits for coarser granularity insights.

The audits and configurations also assume the use of Brave and controls Shields as configured, as well as handling cookie/tracking consent dialogs for more accurate measurements on specific sites.


## How to Use

Using with Brave and shields down:

```bash
CHROME_PATH=/Applications/Brave\ Browser\ Nightly.app/Contents/MacOS/Brave\ Browser\ Nightly \
lighthouse --config-path=config-brave-noshields.js \
        --output html json \
        --output-path reports/cnn_noblocking --save-assets \
        --emulated-form-factor desktop \
        --throttling-method=provided \
        https://edition.cnn.com/2019/08/17/europe/russia-nuclear-summer-skyfall-intl/index.html --view
```

Using with Brave default configuration:

```bash
CHROME_PATH=/Applications/Brave\ Browser\ Nightly.app/Contents/MacOS/Brave\ Browser\ Nightly \
lighthouse --config-path=config-brave.js \
        --output html json \
        --output-path reports/cnn_noblocking --save-assets \
        --emulated-form-factor desktop \
        --throttling-method=provided \
        https://edition.cnn.com/2019/08/17/europe/russia-nuclear-summer-skyfall-intl/index.html --view
```


### Batch Mode

use [lighthouse-batch](https://www.npmjs.com/package/lighthouse-batch) to run multiple pages at once:

```bash
lighthouse-batch \
    --file data/selected-urls.txt \
    --out reports/brave_blocking_desktop \
    --html \
    --params "--emulated-form-factor desktop --throttling-method=provided --config-path=config-brave.js"
```



## Collecting all consent interactions

On sites that implement cookie/GDPR consent properly, the various ads and trackers don't even get loaded before the user consents to it. While this is especially of interest to us, any such page would not give a realistic set of metrics even for the site developer using standard Lighthouse configuration.

There is no general method of handling consent, so it has to be done on a case-by-case basis. We added a separate set of data gatherers and audits to extract manual user clicks to a reusable format and added a separate pass to our configurations to replay those interactions before actually measuring the page on the next pass. Lighthouse isn't generally meant for interactive testing, so we picked a timeout that's long enough for a consent banner to load, and for a trained user to locate it and click on the accept button.

An additional difficulty with the approach is that consent is sometimes loaded in a separate iframes, sometimes loaded from a separate origin when consent is handled by a third-party. In such setup even the [Chrome DevTools Protocol's `getFrameTree`](https://chromedevtools.github.io/devtools-protocol/tot/Page#method-getFrameTree) method does not return the iframes, so we automaticaly attach to every new iframe target at load time, inject a script that logs clicks to `Local Storage` and subscribe to DevTools Protocol's `Local Storage` events, dumping everything to a minimal Lighthouse audit in JSON format. 

To run Lighthouse on each site, manually watching for load and clicking on the consent items:

```bash
lighthouse-batch \
    --file data/selected-sites.txt \
    --out reports_consent/ \
    --params "--emulated-form-factor desktop --throttling-method=provided --config-path=config-consent.js --chrome-flags=\"--no-sandbox --allow-running-insecure-content --ignore-certificate-errors --disable-translate --disable-sync --disable-background-networking --window-size=1400,1200\""
```

Extract just the query selectors that were identified:

```bash
jq -s 'map({url: .requestedUrl, clicks: (.audits | ."consent-interaction-log" | .details) })
  | map(select(.clicks | keys | length > 0))' \
  reports_consent/*.json > blocklists/consent-selectors.json
```

The resulting JSON file can then be used by `control-consent-accept.js` audit.


## Example Dataset

We ran a study with measurements collected with this tool using [sites](./tree/master/data/selected-sites.txt) and [10 pages per site](./tree/master/data/selected-urls.txt) in the [data/](./tree/master/data) directory.

