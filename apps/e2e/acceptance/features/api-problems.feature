@REQ-API-PROBLEM-001
Feature: Public API failures are safe

  Rule: Problem occurrence identifiers are opaque and validated

    @SCN-API-PROBLEM-01
    Scenario: Valid request identifiers produce absolute occurrence URIs
      Given the valid request identifier "request-123"
      When a problem occurrence URI is created
      Then the occurrence URI is absolute and contains "request-123"

    @SCN-API-PROBLEM-02
    Scenario: Unsafe request identifiers are rejected
      Given an unsafe request identifier
      When a problem occurrence URI is created
      Then occurrence URI creation is rejected
