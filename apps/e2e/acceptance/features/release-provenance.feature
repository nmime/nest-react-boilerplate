@REQ-ASSURANCE-RELEASE-003
Feature: Releases use verified source

  Rule: A successful workflow authorizes only its own current main revision

    @SCN-ASSURANCE-RELEASE-01
    Scenario: Release provenance is exact
      Given the release workflow
      When its successful CI provenance is inspected
      Then it checks out the successful workflow SHA
      And it refuses a SHA that is no longer current main
