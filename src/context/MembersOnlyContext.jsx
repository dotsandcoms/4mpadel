import React, { createContext, useContext } from 'react';

const MembersOnlyContext = createContext({
    promptMembersOnly: () => {},
});

export const MembersOnlyProvider = ({ promptMembersOnly, children }) => (
    <MembersOnlyContext.Provider value={{ promptMembersOnly: promptMembersOnly || (() => {}) }}>
        {children}
    </MembersOnlyContext.Provider>
);

export const useMembersOnly = () => useContext(MembersOnlyContext);
