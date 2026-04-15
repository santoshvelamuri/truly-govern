export type GovernanceView =
  | { page: "advisor" }
  | { page: "policies" }
  | { page: "policies-new" }
  | { page: "policies-detail"; id: string }
  | { page: "deviations" }
  | { page: "deviations-detail"; id: string }
  | { page: "exceptions" }
  | { page: "exceptions-new" }
  | { page: "exceptions-detail"; id: string }
  | { page: "reviews" }
  | { page: "reviews-new" }
  | { page: "reviews-edit"; id: string }
  | { page: "reviews-detail"; id: string }
  | { page: "decisions" }
  | { page: "decisions-new" }
  | { page: "decisions-detail"; id: string }
  | { page: "arb" }
  | { page: "arb-board-detail"; boardId: string }
  | { page: "arb-detail"; id: string }
  | { page: "patterns" }
  | { page: "patterns-new" }
  | { page: "patterns-detail"; id: string }
  | { page: "patterns-review"; id: string }
  | { page: "adrs" }
  | { page: "adrs-new" }
  | { page: "adrs-new-supersede"; supersedeId: string }
  | { page: "adrs-detail"; id: string }
  | { page: "settings" }
  | { page: "standards" }
  | { page: "compliance" };
