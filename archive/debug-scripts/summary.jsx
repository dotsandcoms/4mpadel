                                                <div className="pt-3 border-t border-white/10">
                                                    <div className="bg-slate-900/50 rounded-[1.5rem] p-4 text-white overflow-hidden relative group border border-white/5 shadow-2xl">
                                                        {/* Decorative Background Glow */}
                                                        <div className="absolute top-0 right-0 w-48 h-48 bg-padel-green/5 rounded-full blur-3xl -mr-24 -mt-24 group-hover:bg-padel-green/10 transition-colors duration-1000" />

                                                        <div className="relative z-10 space-y-4">
                                                            {/* Itemized list */}
                                                            <div className="space-y-3">
                                                                <div className="space-y-2">
                                                                    {/* Registrant Section */}
                                                                    <div className="space-y-2">
                                                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green mb-1">Your Entries</p>
                                                                        {selectedDivisions.map(div => (
                                                                            <div key={`reg-${div}`} className="flex justify-between items-start gap-4 bg-white/[0.03] p-2.5 rounded-xl border border-white/5">
                                                                                <div className="space-y-0.5">
                                                                                    <p className="text-[9px] font-bold uppercase tracking-widest text-white/90">{formData.full_name || 'You'}</p>
                                                                                    <p className="text-[8px] font-black text-padel-green uppercase tracking-wider italic">{div}</p>
                                                                                </div>
                                                                                <span className="text-[10px] font-black tracking-tight whitespace-nowrap pt-0.5">R{getEntryFeeForCategory(div)}</span>
                                                                            </div>
                                                                        ))}
                                                                        {selectedDivisions.length === 0 && (
                                                                            <div className="flex justify-between items-start gap-4 opacity-30 p-3">
                                                                                <div className="space-y-0.5">
                                                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/90">{formData.full_name || 'You'}</p>
                                                                                    <p className="text-[9px] font-medium text-white/40 uppercase tracking-wider">No Category Selected</p>
                                                                                </div>
                                                                                <span className="text-xs font-black tracking-tight whitespace-nowrap pt-0.5">R0</span>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {playerProfileData && !playerProfileData.paid_registration && (
                                                                        <div className="flex justify-between items-center bg-padel-green/10 p-2.5 rounded-xl border border-padel-green/20">
                                                                            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-padel-green">4M Padel {licenseChoice === 'full' ? 'Full' : 'Temp'} License</span>
                                                                            <span className="text-[10px] font-black text-padel-green">R{licenseChoice === 'full' ? FEES.FULL_LICENSE : FEES.TEMPORARY_LICENSE}</span>
                                                                        </div>
                                                                    )}

                                                                    {/* Partner Section - Conditional */}
                                                                    {hasPartner && partnerProfile && (
                                                                        <div className="space-y-2 pt-1">
                                                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-0.5">Partner Entries</p>
                                                                            {selectedDivisions.map(div => (
                                                                                <div key={`par-${div}`} className="flex justify-between items-start gap-4 bg-white/[0.03] p-2.5 rounded-xl border border-white/5">
                                                                                    <div className="space-y-0.5">
                                                                                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/90">{partnerProfile.name} <span className="opacity-50">(Partner)</span></p>
                                                                                        <p className="text-[8px] font-black text-blue-400 uppercase tracking-wider italic">{div}</p>
                                                                                    </div>
                                                                                    <span className="text-[10px] font-black tracking-tight whitespace-nowrap pt-0.5">R{getEntryFeeForCategory(div)}</span>
                                                                                </div>
                                                                            ))}
                                                                            {payForPartner && !partnerProfile.paid_registration && (
                                                                                <div className="flex justify-between items-center bg-blue-400/10 p-2.5 rounded-xl border border-blue-400/20 mt-1">
                                                                                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-blue-400">Partner {partnerLicenseChoice === 'full' ? 'Full' : 'Temp'} License</span>
                                                                                    <span className="text-[10px] font-black text-blue-400">R{partnerLicenseChoice === 'full' ? FEES.FULL_LICENSE : FEES.TEMPORARY_LICENSE}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                </div>
                                                            </div>

                                                            {/* Bottom Action Area */}
                                                            <div className="pt-4 border-t border-white/10 mt-1">
                                                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
                                                                    <div className="space-y-0.5">
                                                                        <p className="text-[8px] font-black uppercase tracking-[0.3em] text-padel-green mb-0.5">Grand Total</p>
                                                                        <div className="flex items-baseline gap-2">
                                                                            <p className="text-3xl font-black tracking-tighter leading-none text-white">R {calculateTotalAmount()}</p>
                                                                            <p className="text-[7px] font-black uppercase tracking-[0.2em] text-white/20 whitespace-nowrap">SECURE PAYSTACK</p>
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleRegister}
                                                                        disabled={isSubmitting || emailCheckStatus === 'not_found' || selectedDivisions.length === 0}
                                                                        className="h-14 px-8 bg-padel-green text-black rounded-xl flex items-center justify-center gap-3 hover:bg-white hover:scale-[1.03] active:scale-95 transition-all duration-500 shadow-2xl shadow-padel-green/30 disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed font-black uppercase tracking-[0.15em] text-[10px] flex-1 md:flex-none group"
                                                                    >
                                                                        <CreditCard className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                                                        <span>Complete Payment</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </>
