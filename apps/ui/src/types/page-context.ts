export interface PageContext {
  showDatePicker: boolean;
  showSearch: boolean;

  setShowDatePicker: (show: boolean) => void;
  setShowSearch: (show: boolean) => void;
}