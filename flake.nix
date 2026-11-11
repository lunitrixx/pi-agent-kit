{
  description = "Dev environment of the project: the shared headfirst-msp/nix-base modules plus the project's own additions";

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
        { pkgs, ... }:
        {
          headfirst.devShell.packages = [ pkgs.git ];

          pre-commit.settings.hooks.markdownlint.excludes = [
            # Third-party skills keep their upstream formatting so updates stay diffable (see .agents/skills/THIRD_PARTY.md).
            "^\\.agents/skills/(verification-before-completion|systematic-debugging|test-driven-development|receiving-code-review|grilling)/"
            # The PR template is a form text, not a document: it does not start with a heading.
            "^\\.forgejo/pull_request_template\\.md$"
          ];
        };
    };
}
