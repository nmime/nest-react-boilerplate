@REQ-AUTH-ACCESS-001
Feature: Authorization claims fail closed

  Rule: Untrusted role claims never create accidental grants

    @SCN-AUTH-ACCESS-01
    Scenario: Malformed roles grant nothing
      Given a malformed role claim
      When authorization normalizes the claim
      Then no role or permission is granted

    @SCN-AUTH-ACCESS-02
    Scenario: Unknown roles grant nothing
      Given an unknown normalized role
      When permissions are resolved
      Then no role or permission is granted
