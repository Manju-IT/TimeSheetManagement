"""Every GraphQL query and mutation used by the app.

Keep this file as the single source of truth for the GraphQL surface. Callers
must never inline a query string.
"""
from __future__ import annotations


# --- Shared fragments ------------------------------------------------------- #

PROJECT_V2_ITEM_FIELDS = """
fragment ProjectItemFields on ProjectV2Item {
  id
  type
  isArchived
  fieldValues(first: 30) {
    nodes {
      __typename
      ... on ProjectV2ItemFieldSingleSelectValue {
        name
        optionId
        field { ... on ProjectV2SingleSelectField { id name } }
      }
    }
  }
  content {
    __typename
    ... on Issue {
      id
      number
      title
      body
      url
      updatedAt
      state
      isArchived
      repository { nameWithOwner }
      assignees(first: 20) { nodes { login } }
    }
    ... on PullRequest {
      id
      number
      title
      body
      url
      updatedAt
      state
      merged
      isArchived
      repository { nameWithOwner }
      assignees(first: 20) { nodes { login } }
    }
    ... on DraftIssue {
      id
      title
      body
      updatedAt
      isArchived
      assignees(first: 20) { nodes { login } }
    }
  }
}
"""


PROJECT_V2_CORE = """
fragment ProjectV2Core on ProjectV2 {
  id
  title
  number
  url
  fields(first: 50) {
    nodes {
      __typename
      ... on ProjectV2SingleSelectField {
        id
        name
        options { id name }
      }
    }
  }
}
"""


# --- Project lookups -------------------------------------------------------- #

GET_ORG_PROJECT = PROJECT_V2_CORE + """
query GetOrgProjectV2($owner: String!, $number: Int!) {
  organization(login: $owner) {
    projectV2(number: $number) { ...ProjectV2Core }
  }
}
"""


GET_USER_PROJECT = PROJECT_V2_CORE + """
query GetUserProjectV2($owner: String!, $number: Int!) {
  user(login: $owner) {
    projectV2(number: $number) { ...ProjectV2Core }
  }
}
"""


# --- Item pagination -------------------------------------------------------- #

GET_PROJECT_ITEMS_PAGE = PROJECT_V2_ITEM_FIELDS + """
query GetProjectItemsPage($projectId: ID!, $after: String, $first: Int!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ...ProjectItemFields }
      }
    }
  }
}
"""


# --- Fetch one item (for conflict check) ----------------------------------- #

GET_PROJECT_ITEM_BY_ID = PROJECT_V2_ITEM_FIELDS + """
query GetProjectItemById($itemId: ID!) {
  node(id: $itemId) {
    ... on ProjectV2Item { ...ProjectItemFields }
  }
}
"""


# --- Mutations -------------------------------------------------------------- #

UPDATE_ISSUE_BODY = """
mutation UpdateIssueBody($issueId: ID!, $body: String!) {
  updateIssue(input: { id: $issueId, body: $body }) {
    issue { id body updatedAt }
  }
}
"""


UPDATE_DRAFT_ISSUE_BODY = """
mutation UpdateDraftIssueBody($draftIssueId: ID!, $body: String!) {
  updateProjectV2DraftIssue(
    input: { draftIssueId: $draftIssueId, body: $body }
  ) {
    draftIssue { id body updatedAt }
  }
}
"""


UPDATE_ITEM_SINGLE_SELECT_FIELD = """
mutation UpdateItemField(
  $projectId: ID!,
  $itemId: ID!,
  $fieldId: ID!,
  $optionId: String!
) {
  updateProjectV2ItemFieldValue(
    input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
      value: { singleSelectOptionId: $optionId }
    }
  ) {
    projectV2Item { id }
  }
}
"""


# --- Viewer (connection test) ---------------------------------------------- #

VIEWER_QUERY = """
query Viewer {
  viewer { login name }
}
"""