# Docs mobile performance baseline

Measured 12 November 2026 against the artifact from Pages run 43282362724
and the faster preview branch. Chromium used a 390 × 844 viewport, device
pixel ratio 2, 80 ms simulated latency, 5 Mbps downstream and 4× CPU
throttling. Each page ran twice in a fresh browser context. Both builds
were served locally without transfer compression and with external requests
blocked.

| Page | Published resources | Preview resources | Published LCP | Preview LCP |
| --- | ---: | ---: | ---: | ---: |
| Homepage | 711 kB | 542 kB | 1.45 s | 1.06 s |
| 4848S040 setup | 2,344 kB | 673 kB | 1.51 s | 1.07 s |
| First setup | 1,457 kB | 529 kB | 0.94 s | 0.94 s |

Resource counts come from the top document and exclude the main HTML and
resources loaded by embedded frames. The published homepage requested the
2.7 MB demo renderer in both runs. The preview did not request it on scroll
before activation. No layout shifts were observed in these lab runs.

For these three routes, keep top-document resources under 750 kB before
interaction at this profile. Keep the demo renderer out of the passive page
load. Use a mobile LCP target of 2.5 seconds and a CLS target of 0.1.
Check field LCP, INP and CLS in Search Console when enough visitor data is
available. The lab samples do not measure field performance.
