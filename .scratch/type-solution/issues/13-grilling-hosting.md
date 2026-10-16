# Grilling: hosting and deployment

Type: grilling
Status: claimed

## Question

Where does the public game run, and how does a new build get there? The app is an Obelisk wasm frontend plus a Snap backend that only serves it, built with `nix build`. Options include running that server on a host (VPS, Fly.io and similar) or serving the built files from static hosting; cover the domain, HTTPS, the CSP header the sandbox needs, and how a deploy is triggered.
