@REQ-NOTIFY-DELIVERY-001
Feature: Notification delivery is explicit

  Rule: Only supported external channels can be dispatched

    @SCN-NOTIFY-DELIVERY-01
    Scenario: In-app content is not externally dispatched
      Given an in-app notification channel
      When it is evaluated for external delivery
      Then the channel is rejected for external delivery

    @SCN-NOTIFY-DELIVERY-02
    Scenario: Email is an external delivery channel
      Given an email notification channel
      When it is evaluated for external delivery
      Then the channel is accepted for external delivery
