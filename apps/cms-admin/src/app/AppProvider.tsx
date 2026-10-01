interface AppProviderProps {
  children: React.ReactNode;
}

const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  return <>{children}</>;
};
AppProvider.displayName = 'AppProvider';

export default AppProvider;
