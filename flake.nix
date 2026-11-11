{
  description = "Dev environment of pi-agent-kit: the shared headfirst-msp/nix-base modules plus Node.js and the package checks";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";
    nix-base.url = "git+ssh://forgejo@git.headfirst.cloud/headfirst-msp/nix-base";
    nix-base.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [ inputs.nix-base.flakeModules.default ];

      perSystem =
        { pkgs, lib, ... }:
        let
          src = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [
              ./package.json
              ./extensions
              ./skills
              ./themes
            ];
          };
        in
        {
          headfirst.devShell.packages = [
            pkgs.git
            pkgs.nodejs_24
          ];

          pre-commit.settings.hooks.markdownlint.excludes = [
            # Third-party skills keep their upstream formatting so updates stay diffable (see .agents/skills/THIRD_PARTY.md).
            "^\\.agents/skills/(verification-before-completion|systematic-debugging|test-driven-development|receiving-code-review|grilling)/"
            # The PR template is a form text, not a document: it does not start with a heading.
            "^\\.forgejo/pull_request_template\\.md$"
          ];

          # pi loads the paths in the `pi` block of package.json without reporting a missing one,
          # so a typo or a rename without a manifest edit ships a resource that is silently absent.
          checks.pi-manifest = pkgs.runCommand "pi-manifest" { nativeBuildInputs = [ pkgs.nodejs_24 ]; } ''
            cd ${src}
            node -e "const fs=require('node:fs');const j=JSON.parse(fs.readFileSync('package.json','utf8'));const paths=[...j.pi.extensions,...j.pi.skills,...j.pi.themes];const missing=paths.filter(p=>!fs.existsSync(p));if(missing.length){console.error('pi manifest points at missing paths: '+missing.join(', '));process.exit(1)}console.log('pi manifest ok: '+paths.length+' paths')"
            touch $out
          '';

          # pi lists every skill's name and description in each request; a skill without them is not
          # offered, and non-ASCII characters were removed from all skills on purpose (#37).
          checks.skills = pkgs.runCommand "skills" { } ''
            cd ${src}
            status=0
            for f in skills/*/SKILL.md; do
              head -n 1 "$f" | grep -qx -- '---' || { echo "$f: no frontmatter"; status=1; }
              grep -q '^name: ' "$f" || { echo "$f: no name"; status=1; }
              grep -q '^description: ' "$f" || { echo "$f: no description"; status=1; }
              if LC_ALL=C grep -n '[^[:print:][:space:]]' "$f"; then echo "$f: non-ASCII characters"; status=1; fi
            done
            [ "$status" = 0 ] && touch $out
            exit "$status"
          '';
        };
    };
}
