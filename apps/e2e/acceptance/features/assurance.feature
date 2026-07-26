@REQ-ASSURANCE-TRACE-001
Feature: Repository behavior remains traceable

  Rule: Every owned project and executable example has a durable requirement

    @SCN-ASSURANCE-TRACE-01
    Scenario: The repository trace is complete
      Given the repository assurance model
      When its project and evidence ownership is validated
      Then no project, requirement, feature, or scenario is orphaned
