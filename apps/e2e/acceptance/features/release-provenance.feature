@REQ-ASSURANCE-RELEASE-003
Feature: Releases use verified source

  Rule: Every configured forge releases only its own verified, current revision

    @SCN-ASSURANCE-RELEASE-01
    Scenario: Release provenance is exact
      Given the release provenance controls in the CI gate descriptor
      When every configured forge's release pipeline is inspected
      Then each release is cut from the exact revision its gates verified
      And a revision the default branch has moved past is refused
